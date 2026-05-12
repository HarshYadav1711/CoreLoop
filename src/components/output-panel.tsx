"use client";

import { formatMs } from "@/lib/format";
import type { RunResult } from "@/lib/run-code";

export type UiStatus = "idle" | "running" | "success" | "timeout" | "error";

const TIMEOUT_LIMIT_MS = 2000;
const OUTPUT_LIMIT_LABEL = "256 KB";

interface OutputPanelProps {
  status: UiStatus;
  response: RunResult | null;
}

export function OutputPanel({ status, response }: OutputPanelProps) {
  const verdict = response ? classifyResult(response) : null;

  return (
    <div className="flex h-full min-h-[280px] flex-col bg-[--background]">
      <ConsoleHeader status={status} response={response} />

      <div className="flex-1 overflow-auto bg-[#0b0f14] px-4 py-3 text-[13px] leading-relaxed text-slate-100 dark:bg-black">
        {status === "idle" && !response && <EmptyState />}
        {status === "running" && <RunningState />}

        {verdict === "timeout" && response && (
          <Banner tone="warning" title="Timed out">
            CoreLoop terminated the program after {formatMs(response.durationMs)}.
            Every run has a hard 2-second limit.
          </Banner>
        )}
        {verdict === "python-error" && response && (
          <Banner tone="danger" title="Python exited with an error">
            Process exited with code {response.exitCode}. See stderr below.
          </Banner>
        )}
        {verdict === "could-not-run" && response && (
          <Banner tone="danger" title="Could not run the program">
            {response.error || "The request failed before Python started."}
          </Banner>
        )}

        {response?.output && (
          <Stream label="stdout" tone="success">
            {response.output}
          </Stream>
        )}
        {verdict === "python-error" && response?.error && (
          <Stream label="stderr" tone="danger">
            {response.error}
          </Stream>
        )}

        {verdict === "success" && response && !response.output && (
          <p className="text-slate-400">
            Program exited cleanly with no output.
          </p>
        )}
      </div>

      <LimitsFooter />
    </div>
  );
}

function ConsoleHeader({
  status,
  response,
}: {
  status: UiStatus;
  response: RunResult | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[--border] bg-[--surface] px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[--muted]">console</span>
        <StatusChip status={status} />
      </div>
      <Meta status={status} response={response} />
    </div>
  );
}

function LimitsFooter() {
  return (
    <div className="border-t border-[--border] bg-[--surface] px-3 py-1.5 text-[11px] text-[--muted]">
      Runtime: Python · Timeout: {formatMs(TIMEOUT_LIMIT_MS)} · Output limit:{" "}
      {OUTPUT_LIMIT_LABEL}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-1 text-slate-400">
      <p>
        Press <Kbd>Cmd/Ctrl</Kbd> + <Kbd>Enter</Kbd> to run, or click{" "}
        <span className="font-medium text-slate-100">Run</span>.
      </p>
      <p className="text-slate-500">
        Stdout, stderr, and timing will appear here.
      </p>
    </div>
  );
}

function RunningState() {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <Spinner />
      <span>Executing on the server…</span>
    </div>
  );
}

type Verdict = "success" | "timeout" | "python-error" | "could-not-run";

function classifyResult(r: RunResult): Verdict {
  if (r.success) return "success";
  if (r.timeout) return "timeout";
  if (r.exitCode !== null) return "python-error";
  return "could-not-run";
}

function Banner({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "warning" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
      : "border-red-500/20 bg-red-500/10 text-red-200";
  return (
    <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${toneClass}`}>
      <span className="font-medium">{title}.</span> {children}
    </div>
  );
}

function Stream({
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

function StatusChip({ status }: { status: UiStatus }) {
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
    return <span className="text-[--muted]">running…</span>;
  }
  if (!response) return <span className="text-[--muted]">idle</span>;

  const left = response.timeout
    ? "timeout"
    : response.exitCode !== null
      ? `exit ${response.exitCode}`
      : "no exit";

  return (
    <span className="text-[--muted]">
      {left} · {formatMs(response.durationMs)}
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
