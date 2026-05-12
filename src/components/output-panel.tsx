"use client";

import type { RunResponse, RunStatus } from "@/lib/run-code";

export type UiStatus = "idle" | "running" | RunStatus;

interface OutputPanelProps {
  status: UiStatus;
  response: RunResponse | null;
  error: string | null;
}

export function OutputPanel({ status, response, error }: OutputPanelProps) {
  return (
    <div className="flex h-full min-h-[280px] flex-col bg-[--background]">
      <div className="flex items-center justify-between border-b border-[--border] bg-[--surface] px-3 py-1.5 text-xs">
        <span className="text-[--muted] font-mono">output</span>
        <Meta status={status} response={response} />
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 text-[13px] leading-relaxed">
        {status === "idle" && !response && !error && <IdleState />}
        {status === "running" && <LoadingState />}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {response?.status === "timeout" && (
          <TimeoutBanner timeoutMs={response.timeoutMs} />
        )}
        {response && response.stdout && (
          <StreamBlock label="stdout" tone="neutral">
            {response.stdout}
          </StreamBlock>
        )}
        {response && response.stderr && (
          <StreamBlock label="stderr" tone="danger">
            {response.stderr}
          </StreamBlock>
        )}
        {response &&
          response.status === "success" &&
          !response.stdout &&
          !response.stderr && (
            <p className="text-[--muted]">
              Program exited successfully with no output.
            </p>
          )}
        {response?.truncated && (
          <p className="mt-3 text-xs text-[--muted]">
            Output truncated at 256 KB.
          </p>
        )}
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <p className="text-[--muted]">
      Press <Kbd>⌘/Ctrl</Kbd> + <Kbd>↵</Kbd> or click{" "}
      <span className="font-medium text-[--foreground]">Run</span> to execute on
      the server.
    </p>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-[--muted]">
      <Spinner />
      <span>Executing on server…</span>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-md border border-[--border] bg-[--surface] px-3 py-2 text-xs text-[--danger]">
      <span className="font-medium">Request failed:</span> {children}
    </div>
  );
}

function TimeoutBanner({ timeoutMs }: { timeoutMs: number }) {
  return (
    <div className="mb-3 rounded-md border border-[--border] bg-[--surface] px-3 py-2 text-xs text-[--warning]">
      Execution exceeded the {timeoutMs} ms limit and was terminated. Any output
      emitted before the kill signal is shown below.
    </div>
  );
}

function StreamBlock({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "neutral" | "danger";
  children: React.ReactNode;
}) {
  const labelColor = tone === "danger" ? "text-[--danger]" : "text-[--muted]";
  return (
    <div className="mb-3 last:mb-0">
      <div
        className={`mb-1 text-[11px] uppercase tracking-wider ${labelColor}`}
      >
        {label}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] text-[--foreground]">
        {children}
      </pre>
    </div>
  );
}

function Meta({
  status,
  response,
}: {
  status: UiStatus;
  response: RunResponse | null;
}) {
  if (status === "running") {
    return <span className="text-[--muted]">running…</span>;
  }
  if (!response) return <span className="text-[--muted]">—</span>;
  const exit =
    response.exitCode !== null
      ? `exit ${response.exitCode}`
      : response.signal
        ? `signal ${response.signal}`
        : "no exit";
  return (
    <span className="text-[--muted]">
      {exit} · {formatMs(response.durationMs)}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[--border] bg-[--surface] px-1 py-0.5 font-mono text-[11px] text-[--foreground]">
      {children}
    </kbd>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border border-[--border] border-t-[--foreground]"
    />
  );
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
