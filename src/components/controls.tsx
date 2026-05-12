"use client";

interface ControlsProps {
  onRun: () => void;
  onReset: () => void;
  onLoadSuccess: () => void;
  onLoadTimeout: () => void;
  isRunning: boolean;
}

export function Controls({
  onRun,
  onReset,
  onLoadSuccess,
  onLoadTimeout,
  isRunning,
}: ControlsProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[--border] bg-[--surface] px-3 py-1.5 text-xs">
      <span className="text-[--muted] font-mono">main.py</span>

      <div className="flex items-center gap-1">
        <GhostButton
          onClick={onLoadSuccess}
          title="Insert the success preset"
          disabled={isRunning}
        >
          Hello
        </GhostButton>
        <GhostButton
          onClick={onLoadTimeout}
          title="Insert the timeout preset"
          disabled={isRunning}
        >
          Timeout
        </GhostButton>
        <Divider />
        <GhostButton
          onClick={onReset}
          title="Reset to the default sample"
          disabled={isRunning}
        >
          Reset
        </GhostButton>
        <Divider />
        <RunButton onClick={onRun} isRunning={isRunning} />
      </div>
    </div>
  );
}

function GhostButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded px-2 py-1 text-[--muted] transition hover:bg-[--border]/60 hover:text-[--foreground] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[--muted]"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-3.5 w-px bg-[--border]" />;
}

function RunButton({
  onClick,
  isRunning,
}: {
  onClick: () => void;
  isRunning: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRunning}
      title="Run (Ctrl/Cmd + Enter)"
      className="inline-flex items-center gap-1.5 rounded-md bg-[--accent] px-2.5 py-1 font-medium text-[--background] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <PlayIcon />
      {isRunning ? "Running" : "Run"}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
      <path d="M4 3.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}
