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
        <div className="flex items-center gap-2">
          <span className="text-[--muted] font-mono">console</span>
          <StatusLabel status={status} />
        </div>
        <Meta status={status} response={response} />
      </div>

      <div className="flex-1 overflow-auto bg-[#0b0f14] px-4 py-3 text-[13px] leading-relaxed text-slate-100 dark:bg-black">
        {status === "idle" && !response && !error && <IdleState />}
        {status === "running" && <LoadingState />}
        {error && <StateBanner title="Request failed" tone="danger">{error}</StateBanner>}
        {response?.status === "success" && (
          <StateBanner title="Execution complete" tone="success">
            Finished in {formatMs(response.durationMs)} with exit code 0.
          </StateBanner>
        )}
        {response?.status === "error" && (
          <StateBanner title="Runtime error" tone="danger">
            Python exited with code {response.exitCode ?? "unknown"}.
          </StateBanner>
        )}
        {response?.status === "timeout" && (
          <StateBanner title="Timed out" tone="warning">
            Execution exceeded {response.timeoutMs} ms and was terminated.
          </StateBanner>
        )}
        {response && response.stdout && (
          <StreamBlock label="stdout" tone="success">
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
            <p className="text-slate-400">
              Program exited successfully with no output.
            </p>
          )}
        {response?.truncated && (
          <p className="mt-3 text-xs text-slate-400">
            Output truncated at 256 KB.
          </p>
        )}
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <p className="text-slate-400">
      Press <Kbd>Cmd/Ctrl</Kbd> + <Kbd>Enter</Kbd> or click{" "}
      <span className="font-medium text-slate-100">Run</span> to execute on
      the server.
    </p>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <Spinner />
      <span>Executing on server...</span>
    </div>
  );
}

function StateBanner({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
        : "border-red-500/20 bg-red-500/10 text-red-200";
  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${toneClass}`}>
      <span className="font-medium">{title}:</span> {children}
    </div>
  );
}

function StreamBlock({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "success" | "danger";
  children: React.ReactNode;
}) {
  const labelColor = tone === "danger" ? "text-red-300" : "text-emerald-300";
  return (
    <div className="mb-3 last:mb-0">
      <div
        className={`mb-1 text-[11px] uppercase tracking-wider ${labelColor}`}
      >
        {label}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] text-slate-100">
        {children}
      </pre>
    </div>
  );
}

function StatusLabel({ status }: { status: UiStatus }) {
  const tone =
    status === "success"
      ? "text-[--success]"
      : status === "timeout"
        ? "text-[--warning]"
        : status === "error"
          ? "text-[--danger]"
          : "text-[--muted]";
  return (
    <span className={`hidden rounded border border-[--border] px-1.5 py-0.5 text-[11px] sm:inline ${tone}`}>
      {status}
    </span>
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
    return <span className="text-[--muted]">running...</span>;
  }
  if (!response) return <span className="text-[--muted]">idle</span>;
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
    <kbd className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 font-mono text-[11px] text-slate-200">
      {children}
    </kbd>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border border-slate-700 border-t-slate-100"
    />
  );
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
