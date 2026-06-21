import React from "react";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  if (!content) return null;

  // Split by line
  const lines = content.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        // 1. Headers
        if (line.startsWith("### ")) {
          return (
            <h3 key={idx} className="text-base font-bold mt-4 mb-2 first:mt-0 text-foreground">
              {parseInline(line.slice(4))}
            </h3>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={idx} className="text-lg font-bold mt-5 mb-2.5 first:mt-0 text-foreground">
              {parseInline(line.slice(3))}
            </h2>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h1 key={idx} className="text-xl font-bold mt-6 mb-3 first:mt-0 text-foreground">
              {parseInline(line.slice(2))}
            </h1>
          );
        }

        // 2. Bullet lists
        const isBullet = line.trim().startsWith("* ") || line.trim().startsWith("+ ") || line.trim().startsWith("- ");
        if (isBullet) {
          // Find indentation level
          const indent = line.search(/\S/); // number of leading spaces
          const contentStr = line.trim().slice(2);
          return (
            <div key={idx} className="flex gap-2 my-1" style={{ paddingLeft: `${indent * 4 + 8}px` }}>
              <span className="text-primary font-bold select-none">•</span>
              <span className="flex-1">{parseInline(contentStr)}</span>
            </div>
          );
        }

        // Default: normal line
        return (
          <p key={idx} className="min-h-[1rem] my-0.5">
            {parseInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function parseInline(text: string): React.ReactNode[] {
  // Split by capturing parentheses to keep the delimiters in the resulting array
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-muted-foreground/15 text-xs font-mono font-semibold border border-border/30">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
