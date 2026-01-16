import { Chunk } from "../minimize/greedyMinimize.js";
import { hashText } from "../util/hash.js";

export function chunkPrompt(promptText: string, granularity: string): Chunk[] {
  const g = granularity || "blocks";
  if (g === "lines") return chunkLines(promptText);
  if (g === "sections") return chunkMarkdownSections(promptText);
  return chunkBlocks(promptText);
}

function chunkLines(text: string): Chunk[] {
  const lines = text.split(/\n/);
  return lines.map((line, idx) => ({
    id: `L${idx + 1}`,
    text: idx === lines.length - 1 ? line : line + "\n",
  }));
}

function chunkBlocks(text: string): Chunk[] {
  const parts = splitKeepDelimiters(text, /\n{2,}/g);
  return parts
    .filter((p) => p.length > 0)
    .map((p, idx) => ({ id: `B${idx + 1}-${hashText(p).slice(0, 8)}`, text: p }));
}

function chunkMarkdownSections(text: string): Chunk[] {
  const lines = text.split(/\n/);
  const sections: string[] = [];
  let current: string[] = [];

  function flush() {
    if (current.length === 0) return;
    sections.push(current.join("\n") + "\n");
    current = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^\s{0,3}#{1,6}\s+/.test(line);
    if (isHeading) flush();
    current.push(line);
  }
  flush();

  return sections.map((s, idx) => ({ id: `S${idx + 1}-${hashText(s).slice(0, 8)}`, text: s }));
}

function splitKeepDelimiters(text: string, delimiter: RegExp): string[] {
  const out: string[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(delimiter)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    out.push(text.slice(lastIndex, start));
    out.push(text.slice(start, end));
    lastIndex = end;
  }
  out.push(text.slice(lastIndex));
  return out;
}

