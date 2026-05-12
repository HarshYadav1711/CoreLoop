"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Monaco = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => <EditorSkeleton />,
  },
);

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

export function CodeEditor({ value, onChange, onSubmit }: CodeEditorProps) {
  const theme = useEditorTheme();

  return (
    <Monaco
      height="100%"
      defaultLanguage="python"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      theme={theme}
      options={{
        fontFamily:
          "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13.5,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 4,
        automaticLayout: true,
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: "line",
        smoothScrolling: true,
        wordWrap: "on",
        overviewRulerLanes: 0,
        scrollbar: { vertical: "auto", horizontal: "auto" },
        guides: { indentation: false },
      }}
      onMount={(editor, monaco) => {
        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
          onSubmit,
        );
      }}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[--muted]">
      Loading editor…
    </div>
  );
}

function useEditorTheme(): "vs-dark" | "light" {
  const [theme, setTheme] = useState<"vs-dark" | "light">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? "vs-dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return theme;
}
