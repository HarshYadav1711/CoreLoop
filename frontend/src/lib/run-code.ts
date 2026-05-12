export interface RunResult {
  success: boolean;
  output: string;
  error: string;
  timeout: boolean;
  durationMs: number;
  exitCode: number | null;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const ENDPOINT = `${API_BASE_URL.replace(/\/$/, "")}/api/run`;

export async function runCode(
  code: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal,
    });
    const data: unknown = await res.json().catch(() => null);
    if (isRunResult(data)) return data;
    return localFailure(`Malformed response (HTTP ${res.status}).`);
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") return localFailure("Request cancelled.");
    return localFailure(e.message || "Network request failed.");
  }
}

function isRunResult(value: unknown): value is RunResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.success === "boolean" &&
    typeof v.output === "string" &&
    typeof v.error === "string" &&
    typeof v.timeout === "boolean" &&
    typeof v.durationMs === "number" &&
    (typeof v.exitCode === "number" || v.exitCode === null)
  );
}

function localFailure(message: string): RunResult {
  return {
    success: false,
    output: "",
    error: message,
    timeout: false,
    durationMs: 0,
    exitCode: null,
  };
}
