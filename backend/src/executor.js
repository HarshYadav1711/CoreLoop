import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const EXECUTION_TIMEOUT_MS = 2000;
export const MAX_CODE_BYTES = 100_000;

const MAX_OUTPUT_BYTES = 256 * 1024;
const DOCKER_IMAGE = process.env.CORELOOP_DOCKER_IMAGE ?? "python:3.13-slim";

export function failure(message) {
  return {
    success: false,
    output: "",
    error: message,
    timeout: false,
    durationMs: 0,
    exitCode: null,
  };
}

export async function runPython(code) {
  const workDir = await mkdtemp(join(tmpdir(), "coreloop-"));
  const sourcePath = join(workDir, "main.py");

  try {
    await writeFile(sourcePath, code, "utf8");
    return await execute(workDir, sourcePath);
  } catch (err) {
    return failure(`Internal executor failure: ${err.message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function pythonBinary() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === "win32" ? "python" : "python3";
}

function isDockerExecutor() {
  return process.env.CORELOOP_EXECUTOR === "docker";
}

function hostPythonSpec(sourcePath) {
  return {
    command: pythonBinary(),
    args: ["-I", "-B", sourcePath],
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
    },
  };
}

function dockerPythonSpec(workDir) {
  const containerName = `coreloop-${randomUUID()}`;
  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "--pull=never",
      "--name",
      containerName,
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,size=16m,mode=1777",
      "--memory",
      "128m",
      "--cpus",
      "0.5",
      "--pids-limit",
      "64",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--user",
      "65534:65534",
      "--workdir",
      "/work",
      "--mount",
      `type=bind,src=${workDir},dst=/work,readonly`,
      "-e",
      "PYTHONIOENCODING=utf-8",
      "-e",
      "PYTHONUNBUFFERED=1",
      DOCKER_IMAGE,
      "python",
      "-I",
      "-B",
      "/work/main.py",
    ],
    cleanup: () => {
      const killer = spawn("docker", ["rm", "-f", containerName], {
        stdio: "ignore",
        shell: false,
        windowsHide: true,
      });
      killer.unref();
    },
  };
}

function executionSpec(workDir, sourcePath) {
  return isDockerExecutor()
    ? dockerPythonSpec(workDir)
    : hostPythonSpec(sourcePath);
}

function execute(workDir, sourcePath) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const dockerMode = isDockerExecutor();
    const spec = executionSpec(workDir, sourcePath);
    const executorName = dockerMode ? "Docker executor" : "Python";

    let child;
    try {
      child = spawn(spec.command, spec.args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        env: spec.env,
      });
    } catch (err) {
      resolve({
        success: false,
        output: "",
        error: `Failed to launch ${executorName}: ${err.message}`,
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

    const capture = (chunk, stream) => {
      const current = stream === "out" ? stdout : stderr;
      const remaining = MAX_OUTPUT_BYTES - current.length;
      if (remaining <= 0) return;
      const text = chunk.toString("utf8");
      const next = text.length > remaining ? text.slice(0, remaining) : text;
      if (stream === "out") stdout += next;
      else stderr += next;
    };

    child.stdout.on("data", (chunk) => capture(chunk, "out"));
    child.stderr.on("data", (chunk) => capture(chunk, "err"));

    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
        spec.cleanup?.();
      } catch {
        // Process already exited.
      }
    }, EXECUTION_TIMEOUT_MS);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(result);
    };

    child.on("error", (err) => {
      finish({
        success: false,
        output: stdout,
        error: stderr || `Failed to launch ${executorName}: ${err.message}`,
        timeout: false,
        durationMs: Date.now() - startedAt,
        exitCode: null,
      });
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - startedAt;

      if (timedOut) {
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
