import { Chunk } from "../minimize/greedyMinimize.js";
import { hashText } from "../util/hash.js";

export function chunkPrompt(promptText: string, granularity: string): Chunk[] {
  const g = granularity || "blocks";
  if (g === "lines") return chunkLines(promptText);
  if (g === "sections") return chunkMarkdownSections(promptText);
  return chunkMarkdownBlocks(promptText);
}

function chunkLines(text: string): Chunk[] {
  const lines = splitLinesKeepEnds(text);
  return lines.map((line, idx) => ({
    id: `L${idx + 1}`,
    text: line,
    preserve: hasKeepTag(line),
  }));
}

function chunkMarkdownSections(text: string): Chunk[] {
  const lines = splitLinesKeepEnds(text);
  const sections: Chunk[] = [];
  let current: string[] = [];
  let inFence: { marker: "```" | "~~~" } | null = null;

  function flush() {
    if (current.length === 0) return;
    const sectionText = current.join("");
    sections.push({
      id: `S${sections.length + 1}-${hashText(sectionText).slice(0, 8)}`,
      text: sectionText,
      preserve: hasKeepTag(sectionText),
    });
    current = [];
  }

  for (const rawLine of lines) {
    const line = stripLineEnd(rawLine);
    const fence = parseFenceMarker(line);
    if (fence) {
      if (inFence && inFence.marker === fence.marker) inFence = null;
      else if (!inFence) inFence = { marker: fence.marker };
    }

    const isHeading = !inFence && /^\s{0,3}#{1,6}\s+/.test(line);
    if (isHeading) flush();
    current.push(rawLine);
  }
  flush();

  return sections;
}

function chunkMarkdownBlocks(text: string): Chunk[] {
  const lines = splitLinesKeepEnds(text);
  const blocks: Chunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = stripLineEnd(lines[i]);

    // Code fence block
    const fence = parseFenceMarker(line);
    if (fence) {
      const start = i;
      i++;
      while (i < lines.length) {
        const l = stripLineEnd(lines[i]);
        const endFence = parseFenceMarker(l);
        i++;
        if (endFence?.marker === fence.marker) break;
      }
      const blockText = lines.slice(start, i).join("");
      blocks.push({
        id: `B${blocks.length + 1}-${hashText(blockText).slice(0, 8)}`,
        text: blockText,
        preserve: hasKeepTag(blockText),
      });
      continue;
    }

    // Blank block (preserve leading whitespace exactly)
    if (isBlankLine(line)) {
      const start = i;
      while (i < lines.length && isBlankLine(stripLineEnd(lines[i]))) i++;
      const blockText = lines.slice(start, i).join("");
      blocks.push({
        id: `B${blocks.length + 1}-${hashText(blockText).slice(0, 8)}`,
        text: blockText,
        preserve: hasKeepTag(blockText),
      });
      continue;
    }

    // Heading line (own block)
    if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      const start = i;
      i++;
      while (i < lines.length && isBlankLine(stripLineEnd(lines[i]))) i++;
      const blockText = lines.slice(start, i).join("");
      blocks.push({
        id: `B${blocks.length + 1}-${hashText(blockText).slice(0, 8)}`,
        text: blockText,
        preserve: hasKeepTag(blockText),
      });
      continue;
    }

    // List group
    if (isListItemLine(line)) {
      const start = i;
      i++;
      while (i < lines.length) {
        const l = stripLineEnd(lines[i]);
        if (isBlankLine(l)) break;
        if (isListItemLine(l) || isIndentedContinuation(l)) {
          i++;
          continue;
        }
        break;
      }
      while (i < lines.length && isBlankLine(stripLineEnd(lines[i]))) i++;
      const blockText = lines.slice(start, i).join("");
      blocks.push({
        id: `B${blocks.length + 1}-${hashText(blockText).slice(0, 8)}`,
        text: blockText,
        preserve: hasKeepTag(blockText),
      });
      continue;
    }

    // Paragraph
    const start = i;
    i++;
    while (i < lines.length) {
      const l = stripLineEnd(lines[i]);
      if (isBlankLine(l)) break;
      if (parseFenceMarker(l)) break;
      if (/^\s{0,3}#{1,6}\s+/.test(l)) break;
      if (isListItemLine(l)) break;
      i++;
    }
    while (i < lines.length && isBlankLine(stripLineEnd(lines[i]))) i++;
    const blockText = lines.slice(start, i).join("");
    blocks.push({
      id: `B${blocks.length + 1}-${hashText(blockText).slice(0, 8)}`,
      text: blockText,
      preserve: hasKeepTag(blockText),
    });
  }

  return blocks;
}

function splitLinesKeepEnds(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

function stripLineEnd(line: string): string {
  return line.endsWith("\n") ? line.slice(0, -1) : line;
}

function isBlankLine(lineNoEnd: string): boolean {
  return /^\s*$/.test(lineNoEnd);
}

function isListItemLine(lineNoEnd: string): boolean {
  return /^\s*(?:[-*+]\s+|\d+\.\s+)/.test(lineNoEnd);
}

function isIndentedContinuation(lineNoEnd: string): boolean {
  return /^\s{2,}\S/.test(lineNoEnd);
}

function parseFenceMarker(lineNoEnd: string): { marker: "```" | "~~~" } | null {
  const trimmed = lineNoEnd.trimStart();
  if (trimmed.startsWith("```")) return { marker: "```" };
  if (trimmed.startsWith("~~~")) return { marker: "~~~" };
  return null;
}

function hasKeepTag(text: string): boolean {
  return /<!--\s*promptmin:keep\s*-->/m.test(text) || /^\s*#\s*keep\s*$/m.test(text);
}
