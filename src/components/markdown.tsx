import React from "react";

interface MarkdownProps {
  content: string;
}

function parseTable(lines: string[]): React.ReactNode | null {
  const tableRows: string[][] = [];
  let separatorFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) break;

    // Skip separator row (| --- | --- |)
    if (/^\|[\s-:|]+\|$/.test(trimmed)) {
      separatorFound = true;
      continue;
    }

    if (!separatorFound && tableRows.length === 0) {
      // First row is header
      tableRows.push(trimmed.split("|").slice(1, -1).map((c) => c.trim()));
    } else if (separatorFound) {
      tableRows.push(trimmed.split("|").slice(1, -1).map((c) => c.trim()));
    }
  }

  if (tableRows.length === 0) return null;

  const header = tableRows[0];
  const body = tableRows.slice(1);

  return (
    <table className="my-2 w-full text-sm border-collapse">
      <thead>
        <tr>
          {header.map((cell, i) => (
            <th key={i} className="text-left px-3 py-1.5 border border-border/50 bg-muted/50 font-semibold text-foreground">
              {parseInline(cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className="px-3 py-1.5 border border-border/50 text-foreground">
                {parseInline(cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Markdown({ content }: MarkdownProps) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Collect consecutive table lines
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseTable(tableLines);
      if (table) elements.push(<React.Fragment key={`table-${i}`}>{table}</React.Fragment>);
      continue;
    }

    // 2. Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-bold mt-4 mb-2 first:mt-0 text-foreground">
          {parseInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-lg font-bold mt-5 mb-2.5 first:mt-0 text-foreground">
          {parseInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-xl font-bold mt-6 mb-3 first:mt-0 text-foreground">
          {parseInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // 3. Bullet lists
    const isBullet = line.trim().startsWith("* ") || line.trim().startsWith("+ ") || line.trim().startsWith("- ");
    if (isBullet) {
      const indent = line.search(/\S/);
      const contentStr = line.trim().slice(2);
      elements.push(
        <div key={i} className="flex gap-2 my-1" style={{ paddingLeft: `${indent * 4 + 8}px` }}>
          <span className="text-primary font-bold select-none">•</span>
          <span className="flex-1">{parseInline(contentStr)}</span>
        </div>
      );
      i++;
      continue;
    }

    // 4. Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // 5. Default: normal line
    elements.push(
      <p key={i} className="min-h-[1rem] my-0.5">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

function parseInline(text: string): React.ReactNode[] {
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
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
