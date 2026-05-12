"use client";

import type { RunResult } from "@/lib/run-code";

export type UiStatus = "idle" | "running" | "success" | "timeout" | "error";

interface OutputPanelProps {
  status: UiStatus;
  response: RunResult | null;
}

export function OutputPanel({ status, response }: OutputPanelProps) {
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
        {status === "idle" && !response && <IdleState />}
        {status === "running" && <LoadingState />}

        {response && response.success && !response.timeout && (
          <StateBanner title="Execution complete" tone="success">
            Finished in {formatMs(response.durationMs)} with exit code{" "}
            {response.exitCode ?? 0}.
          </StateBanner>
        )}
        {response && response.timeout && (
          <StateBanner title="Timed out" tone="warning">
            Execution exceeded 2000 ms and was terminated.
          </StateBanner>
        )}
        {response && !response.success && !response.timeout && (
          <StateBanner title="Runtime error" tone="danger">
            Python exited with code {response.exitCode ?? "unknown"}.
          </StateBanner>
        )}

        {response && response.output && (
          <StreamBlock label="stdout" tone="success">
            {response.output}
          </StreamBlock>
        )}
        {response && response.error && (
          <StreamBlock label="stderr" tone="danger">
            {response.error}
          </StreamBlock>
        )}
        {response &&
          response.success &&
          !response.output &&
          !response.error && (
            <p className="text-slate-400">
              Program exited successfully with no output.
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
      <span className="font-medium text-slate-100">Run</span> to execute on the
      server.
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
    <span
      className={`hidden rounded border border-[--border] px-1.5 py-0.5 text-[11px] sm:inline ${tone}`}
    >
      {status}
    </span>
  );
}

function Meta({
  status,
  response,
}: {
  status: UiStatus;
  response: RunResult | null;
}) {
  if (status === "running") {
    return <span className="text-[--muted]">running...</span>;
  }
  if (!response) return <span className="text-[--muted]">idle</span>;
  const exit =
    response.exitCode !== null ? `exit ${response.exitCode}` : "no exit";
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
