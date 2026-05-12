export type RunStatus = "success" | "timeout" | "error";

export interface RunResponse {
  status: RunStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
  timeoutMs: number;
}

export type RunOutcome =
  | { ok: true; data: RunResponse }
  | { ok: false; error: string };

const ENDPOINT = "/api/run";

export async function runCode(
  code: string,
  signal?: AbortSignal,
): Promise<RunOutcome> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal,
    });
    const payload: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `HTTP ${res.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, data: payload as RunResponse };
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") return { ok: false, error: "Request cancelled." };
    return { ok: false, error: e.message };
  }
}
