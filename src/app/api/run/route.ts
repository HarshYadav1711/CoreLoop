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

interface RunResult {
  success: boolean;
  output: string;
  error: string;
  timeout: boolean;
  durationMs: number;
  exitCode: number | null;
}

function pythonBinary(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === "win32" ? "python" : "python3";
}

function fail(message: string, status: number): NextResponse {
  const body: RunResult = {
    success: false,
    output: "",
    error: message,
    timeout: false,
    durationMs: 0,
    exitCode: null,
  };
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  const code =
    typeof payload === "object" && payload !== null && "code" in payload
      ? (payload as { code: unknown }).code
      : undefined;

  if (typeof code !== "string") {
    return fail('Field "code" is required and must be a string.', 400);
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return fail(`Code exceeds the ${MAX_CODE_BYTES}-byte limit.`, 413);
  }

  const workDir = await mkdtemp(join(tmpdir(), "coreloop-"));
  const sourcePath = join(workDir, "main.py");

  try {
    await writeFile(sourcePath, code, "utf8");
    const result = await execute(sourcePath);
    return NextResponse.json(result);
  } catch (err) {
    return fail(
      `Internal executor failure: ${(err as Error).message}`,
      500,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function execute(sourcePath: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    let child: ChildProcess;
    try {
      child = spawn(
        pythonBinary(),
        ["-I", "-B", sourcePath],
        {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            PYTHONUNBUFFERED: "1",
          },
        },
      );
    } catch (err) {
      resolve({
        success: false,
        output: "",
        error: `Failed to launch Python: ${(err as Error).message}`,
        timeout: false,
        durationMs: Date.now() - startedAt,
        exitCode: null,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const capture = (chunk: Buffer, stream: "out" | "err") => {
      const current = stream === "out" ? stdout : stderr;
      const remaining = MAX_OUTPUT_BYTES - current.length;
      if (remaining <= 0) return;
      const text = chunk.toString("utf8");
      const next = text.length > remaining ? text.slice(0, remaining) : text;
      if (stream === "out") stdout += next;
      else stderr += next;
    };

    (child.stdout as Readable).on("data", (chunk: Buffer) =>
      capture(chunk, "out"),
    );
    (child.stderr as Readable).on("data", (chunk: Buffer) =>
      capture(chunk, "err"),
    );

    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore — process already exited.
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
        success: false,
        output: stdout,
        error: stderr || `Failed to launch Python: ${err.message}`,
        timeout: false,
        durationMs: Date.now() - startedAt,
        exitCode: null,
      });
    });

    child.on("close", (code: number | null) => {
      const durationMs = Date.now() - startedAt;

      if (timedOut) {
        // The `timeout: true` flag is the canonical signal for callers;
        // we leave `error` as whatever Python actually emitted (usually
        // empty) rather than injecting an executor-side marker.
        finish({
          success: false,
          output: stdout,
          error: stderr,
          timeout: true,
          durationMs,
          exitCode: code,
        });
        return;
      }

      finish({
        success: code === 0,
        output: stdout,
        error: stderr,
        timeout: false,
        durationMs,
        exitCode: code,
      });
    });
  });
}
