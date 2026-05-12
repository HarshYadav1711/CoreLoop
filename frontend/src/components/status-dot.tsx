"use client";

import type { UiStatus } from "@/components/output-panel";
import { formatMs } from "@/lib/format";
import type { RunResult } from "@/lib/run-code";

interface StatusDotProps {
  status: UiStatus;
  response: RunResult | null;
}

const STATUS_MAP: Record<UiStatus, { label: string; color: string }> = {
  idle: { label: "Idle", color: "bg-[--border]" },
  running: { label: "Running", color: "bg-[--muted]" },
  success: { label: "Success", color: "bg-[--success]" },
  timeout: { label: "Timeout", color: "bg-[--warning]" },
  error: { label: "Error", color: "bg-[--danger]" },
};

export function StatusDot({ status, response }: StatusDotProps) {
  const { label, color } = STATUS_MAP[status];
  const showDuration =
    response !== null && status !== "idle" && status !== "running";

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${color}`}
      />
      <span className="text-[--muted]">
        {label}
        {showDuration && response && (
          <span className="ml-1.5">· {formatMs(response.durationMs)}</span>
        )}
      </span>
    </div>
  );
}
