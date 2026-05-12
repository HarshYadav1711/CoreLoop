"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/editor";
import { Controls } from "@/components/controls";
import { OutputPanel, type UiStatus } from "@/components/output-panel";
import { runCode, type RunResult } from "@/lib/run-code";

const SAMPLE_HELLO = `print("Hello Empower")\n`;

const SAMPLE_TIMEOUT = `# The server kills this after 2 seconds.
while True:
    pass
`;

const DEFAULT_CODE = SAMPLE_HELLO;

function deriveStatus(result: RunResult): "success" | "timeout" | "error" {
  if (result.timeout) return "timeout";
  if (result.success) return "success";
  return "error";
}

export default function Home() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [response, setResponse] = useState<RunResult | null>(null);
  const runRef = useRef<() => void>(() => {});
  const isRunningRef = useRef(false);

  const handleRun = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setStatus("running");
    setResponse(null);
    const result = await runCode(code);
    setResponse(result);
    setStatus(deriveStatus(result));
    isRunningRef.current = false;
  }, [code]);

  const replaceSample = useCallback((next: string) => {
    if (isRunningRef.current) return;
    setCode(next);
    setStatus("idle");
    setResponse(null);
  }, []);

  useEffect(() => {
    runRef.current = handleRun;
  }, [handleRun]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-[--background]">
      <header className="flex h-12 items-center justify-between border-b border-[--border] bg-[--background] px-4 sm:px-6">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight">CoreLoop</span>
          <span className="hidden text-xs text-[--muted] sm:inline">
            Run Python on the server · 2 s hard limit
          </span>
        </div>
        <StatusDot status={status} response={response} />
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-[--border] lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="flex min-h-[360px] flex-col bg-[--background]">
          <Controls
            onRun={() => runRef.current()}
            onReset={() => replaceSample(DEFAULT_CODE)}
            onLoadSuccess={() => replaceSample(SAMPLE_HELLO)}
            onLoadTimeout={() => replaceSample(SAMPLE_TIMEOUT)}
            isRunning={status === "running"}
          />
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={code}
              onChange={setCode}
              onSubmit={() => runRef.current()}
            />
          </div>
        </div>

        <OutputPanel status={status} response={response} />
      </section>
    </main>
  );
}

function StatusDot({
  status,
  response,
}: {
  status: UiStatus;
  response: RunResult | null;
}) {
  const map: Record<UiStatus, { label: string; color: string }> = {
    idle: { label: "Idle", color: "bg-[--border]" },
    running: { label: "Running", color: "bg-[--muted]" },
    success: { label: "Success", color: "bg-[--success]" },
    timeout: { label: "Timeout", color: "bg-[--warning]" },
    error: { label: "Error", color: "bg-[--danger]" },
  };
  const c = map[status];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${c.color}`} />
      <span className="text-[--muted]">
        {c.label}
        {response && status !== "idle" && status !== "running" && (
          <span className="ml-1.5">· {formatMs(response.durationMs)}</span>
        )}
      </span>
    </div>
  );
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
