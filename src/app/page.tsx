"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const Editor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false, loading: () => <EditorSkeleton /> },
);

type ApiStatus = "success" | "timeout" | "error";

type UiStatus = "idle" | "running" | ApiStatus;

interface RunResponse {
  status: ApiStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
  timeoutMs: number;
}

const DEFAULT_CODE = `print("Hello Empower")\n`;

const EXAMPLES: { label: string; code: string }[] = [
  { label: "Hello", code: `print("Hello Empower")\n` },
  {
    label: "Math",
    code: `n = 20
fib = [0, 1]
for _ in range(n - 2):
    fib.append(fib[-1] + fib[-2])
print(fib)
`,
  },
  {
    label: "Timeout",
    code: `# Server will kill this after 2 seconds.
while True:
    pass
`,
  },
  {
    label: "Error",
    code: `def boom():
    raise ValueError("intentional failure")

boom()
`,
  },
];

export default function Home() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [status, setStatus] = useState<UiStatus>("idle");
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const runRef = useRef<() => void>(() => {});

  const isRunning = status === "running";

  const run = useCallback(async () => {
    if (isRunning) return;
    setStatus("running");
    setClientError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClientError(
          typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
        );
        setStatus("error");
        return;
      }
      setResponse(data as RunResponse);
      setStatus((data as RunResponse).status);
    } catch (err) {
      setClientError((err as Error).message);
      setStatus("error");
    }
  }, [code, isRunning]);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

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

  const editorTheme = useEditorTheme();

  return (
    <main className="flex min-h-screen flex-col">
      <Header
        status={status}
        durationMs={response?.durationMs ?? null}
        onRun={run}
        isRunning={isRunning}
      />

      <section className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-px bg-[--border]">
        <div className="flex flex-col bg-[--background]">
          <Toolbar
            onPick={(snippet) => setCode(snippet)}
            onReset={() => setCode(DEFAULT_CODE)}
          />
          <div className="flex-1 min-h-[360px]">
            <Editor
              height="100%"
              defaultLanguage="python"
              value={code}
              onChange={(value) => setCode(value ?? "")}
              theme={editorTheme}
              options={{
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                tabSize: 4,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                renderLineHighlight: "line",
                smoothScrolling: true,
                wordWrap: "on",
              }}
              onMount={(editor, monaco) => {
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                  () => runRef.current(),
                );
              }}
            />
          </div>
        </div>

        <OutputPane
          status={status}
          response={response}
          clientError={clientError}
        />
      </section>

      <Footer />
    </main>
  );
}

function Header({
  status,
  durationMs,
  onRun,
  isRunning,
}: {
  status: UiStatus;
  durationMs: number | null;
  onRun: () => void;
  isRunning: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-[--border] bg-[--background] px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <Logo />
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight tracking-tight">
            CoreLoop
          </h1>
          <p className="hidden sm:block text-xs text-[--muted] truncate">
            Browser Python editor backed by real server-side execution.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <StatusPill status={status} durationMs={durationMs} />
        <button
          onClick={onRun}
          disabled={isRunning}
          className="inline-flex items-center gap-2 rounded-md bg-[--accent] px-3.5 py-1.5 text-sm font-medium text-[--background] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlayIcon className="h-3.5 w-3.5" />
          {isRunning ? "Running…" : "Run"}
          <kbd className="ml-1 hidden rounded border border-white/20 px-1 text-[10px] text-white/70 sm:inline">
            ⌘/Ctrl ↵
          </kbd>
        </button>
      </div>
    </header>
  );
}

function Toolbar({
  onPick,
  onReset,
}: {
  onPick: (code: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-[--border] bg-[--surface] px-3 py-2 text-xs">
      <span className="text-[--muted]">main.py</span>
      <span className="text-[--muted]">·</span>
      <span className="text-[--muted]">examples:</span>
      {EXAMPLES.map((ex) => (
        <button
          key={ex.label}
          onClick={() => onPick(ex.code)}
          className="rounded px-1.5 py-0.5 text-[--foreground] hover:bg-[--border]/60"
        >
          {ex.label}
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={onReset}
        className="rounded px-1.5 py-0.5 text-[--muted] hover:text-[--foreground] hover:bg-[--border]/60"
      >
        Reset
      </button>
    </div>
  );
}

function OutputPane({
  status,
  response,
  clientError,
}: {
  status: UiStatus;
  response: RunResponse | null;
  clientError: string | null;
}) {
  return (
    <div className="flex min-h-[280px] flex-col bg-[--background]">
      <div className="flex items-center justify-between border-b border-[--border] bg-[--surface] px-3 py-2 text-xs">
        <span className="text-[--muted]">output</span>
        <OutputMeta status={status} response={response} />
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        {status === "idle" && !response && (
          <p className="text-[--muted]">
            Press <Kbd>⌘/Ctrl</Kbd> + <Kbd>↵</Kbd> or click{" "}
            <span className="font-semibold text-[--foreground]">Run</span> to
            execute the code on the server.
          </p>
        )}

        {status === "running" && (
          <p className="text-[--muted]">Executing on server…</p>
        )}

        {clientError && (
          <Block label="Request failed" tone="danger">
            {clientError}
          </Block>
        )}

        {response?.status === "timeout" && (
          <Block label="Timed out" tone="warning">
            Execution exceeded the {response.timeoutMs} ms limit and was
            terminated. Any output emitted before the kill signal is shown
            below.
          </Block>
        )}

        {response && response.stdout && (
          <Block label="stdout" tone="neutral" mono>
            {response.stdout}
          </Block>
        )}

        {response && response.stderr && (
          <Block label="stderr" tone="danger" mono>
            {response.stderr}
          </Block>
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

function OutputMeta({
  status,
  response,
}: {
  status: UiStatus;
  response: RunResponse | null;
}) {
  if (status === "running") {
    return <span className="text-[--muted]">running…</span>;
  }
  if (!response) return <span className="text-[--muted]">idle</span>;
  const exit =
    response.exitCode !== null
      ? `exit ${response.exitCode}`
      : response.signal
        ? `signal ${response.signal}`
        : "no exit code";
  return (
    <span className="text-[--muted]">
      {exit} · {formatMs(response.durationMs)}
    </span>
  );
}

function Block({
  label,
  tone,
  mono,
  children,
}: {
  label: string;
  tone: "neutral" | "danger" | "warning";
  mono?: boolean;
  children: React.ReactNode;
}) {
  const toneColor =
    tone === "danger"
      ? "text-[--danger]"
      : tone === "warning"
        ? "text-[--warning]"
        : "text-[--muted]";
  return (
    <div className="mb-3 last:mb-0">
      <div
        className={`mb-1 text-[11px] uppercase tracking-wider ${toneColor}`}
      >
        {label}
      </div>
      <pre
        className={`whitespace-pre-wrap break-words text-[13px] ${
          mono ? "font-mono" : "font-sans"
        } text-[--foreground]`}
      >
        {children}
      </pre>
    </div>
  );
}

function StatusPill({
  status,
  durationMs,
}: {
  status: UiStatus;
  durationMs: number | null;
}) {
  const config = useMemo(() => {
    switch (status) {
      case "running":
        return { label: "Running", color: "bg-[--muted]" };
      case "success":
        return { label: "Success", color: "bg-[--success]" };
      case "timeout":
        return { label: "Timeout", color: "bg-[--warning]" };
      case "error":
        return { label: "Error", color: "bg-[--danger]" };
      default:
        return { label: "Idle", color: "bg-[--border]" };
    }
  }, [status]);

  return (
    <div className="hidden items-center gap-2 text-xs text-[--muted] sm:flex">
      <span className={`inline-block h-2 w-2 rounded-full ${config.color}`} />
      <span className="font-medium text-[--foreground]">{config.label}</span>
      {durationMs !== null && status !== "idle" && status !== "running" && (
        <span>· {formatMs(durationMs)}</span>
      )}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[--border] bg-[--surface] px-4 py-2.5 text-xs text-[--muted] sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Hard 2-second timeout · stdout & stderr captured · prototype only —
          do not paste untrusted code.
        </span>
        <span>
          <a
            href="https://github.com/"
            className="underline-offset-2 hover:underline"
          >
            source
          </a>
        </span>
      </div>
    </footer>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[--border] bg-[--surface] px-1 py-0.5 text-[11px] font-mono text-[--foreground]">
      {children}
    </kbd>
  );
}

function Logo() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[--accent] text-[--background]">
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 4a4 4 0 1 1-3 6.93" />
        <path d="M8 1v4l2-2" />
      </svg>
    </div>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor">
      <path d="M4 3.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[--muted]">
      Loading editor…
    </div>
  );
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function useEditorTheme(): "vs-dark" | "light" {
  const [theme, setTheme] = useState<"vs-dark" | "light">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(mq.matches ? "vs-dark" : "light");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return theme;
}
