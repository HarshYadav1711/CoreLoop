import { NextResponse } from "next/server";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXECUTION_TIMEOUT_MS = 2000;
const MAX_CODE_BYTES = 100_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

type RunStatus = "success" | "timeout" | "error";

interface RunResult {
  status: RunStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  truncated: boolean;
  timeoutMs: number;
}

function pythonBinary(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === "win32" ? "python" : "python3";
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const code =
    typeof payload === "object" && payload !== null && "code" in payload
      ? (payload as { code: unknown }).code
      : undefined;

  if (typeof code !== "string") {
    return NextResponse.json(
      { error: 'Field "code" is required and must be a string.' },
      { status: 400 },
    );
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return NextResponse.json(
      { error: `Code exceeds the ${MAX_CODE_BYTES}-byte limit.` },
      { status: 413 },
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), "coreloop-"));
  const sourcePath = join(workDir, "main.py");
  await writeFile(sourcePath, code, "utf8");

  try {
    const result = await execute(sourcePath);
    return NextResponse.json(result);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function execute(sourcePath: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const bin = pythonBinary();

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
    };

    let child: ChildProcess;
    try {
      child = spawn(bin, ["-I", "-B", sourcePath], {
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        status: "error",
        stdout: "",
        stderr: `Failed to launch Python (${bin}): ${(err as Error).message}`,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        signal: null,
        truncated: false,
        timeoutMs: EXECUTION_TIMEOUT_MS,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const append = (chunk: Buffer, target: "stdout" | "stderr") => {
      const current = target === "stdout" ? stdout : stderr;
      const remaining = MAX_OUTPUT_BYTES - current.length;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      const text = chunk.toString("utf8");
      const next = text.length > remaining ? text.slice(0, remaining) : text;
      if (text.length > remaining) truncated = true;
      if (target === "stdout") stdout += next;
      else stderr += next;
    };

    (child.stdout as Readable).on("data", (chunk: Buffer) =>
      append(chunk, "stdout"),
    );
    (child.stderr as Readable).on("data", (chunk: Buffer) =>
      append(chunk, "stderr"),
    );

    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, EXECUTION_TIMEOUT_MS);

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(result);
    };

    child.on("error", (err: Error) => {
      finish({
        status: "error",
        stdout,
        stderr: stderr + (stderr ? "\n" : "") + `[runtime] ${err.message}`,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        signal: null,
        truncated,
        timeoutMs: EXECUTION_TIMEOUT_MS,
      });
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      const durationMs = Date.now() - startedAt;
      if (timedOut) {
        finish({
          status: "timeout",
          stdout,
          stderr,
          durationMs,
          exitCode: code,
          signal,
          truncated,
          timeoutMs: EXECUTION_TIMEOUT_MS,
        });
        return;
      }
      finish({
        status: code === 0 ? "success" : "error",
        stdout,
        stderr,
        durationMs,
        exitCode: code,
        signal,
        truncated,
        timeoutMs: EXECUTION_TIMEOUT_MS,
      });
    });
  });
}
