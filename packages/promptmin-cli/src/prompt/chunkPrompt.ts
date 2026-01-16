import { Chunk } from "../minimize/greedyMinimize.js";
import { hashText } from "../util/hash.js";
import { PreserveSelector } from "../config/loadConfig.js";

export function chunkPrompt(
  promptText: string,
  granularity: string,
  options?: { preserve?: PreserveSelector[] },
): Chunk[] {
  const g = granularity || "blocks";
  const preserve = options?.preserve || [];
  if (g === "lines") return applyPreserve(chunkLines(promptText), preserve, "lines");
  if (g === "sentences") return applyPreserve(chunkSentences(promptText), preserve, "lines");
  if (g === "sections") return applyPreserve(chunkMarkdownSections(promptText), preserve, "sections");
  return applyPreserve(chunkMarkdownBlocks(promptText), preserve, "blocks");
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

function chunkSentences(text: string): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  let current = "";
  let inFence: { marker: "```" | "~~~" } | null = null;

  while (i < text.length) {
    // Fence detection on line boundaries
    if (i === 0 || text[i - 1] === "\n") {
      const lineEnd = text.indexOf("\n", i);
      const line = lineEnd === -1 ? text.slice(i) : text.slice(i, lineEnd);
      const fence = parseFenceMarker(line);
      if (fence) {
        if (inFence && inFence.marker === fence.marker) inFence = null;
        else if (!inFence) inFence = { marker: fence.marker };
      }
    }

    const ch = text[i];
    current += ch;

    if (!inFence && (ch === "." || ch === "!" || ch === "?")) {
      // include trailing quotes/brackets
      let j = i + 1;
      while (j < text.length && /["')\]]/.test(text[j])) {
        current += text[j];
        j++;
      }
      // consume whitespace after terminator
      while (j < text.length && /\s/.test(text[j])) {
        current += text[j];
        j++;
      }
      out.push({ id: `T${out.length + 1}-${hashText(current).slice(0, 8)}`, text: current, preserve: hasKeepTag(current) });
      current = "";
      i = j;
      continue;
    }

    i++;
  }

  if (current.length) out.push({ id: `T${out.length + 1}-${hashText(current).slice(0, 8)}`, text: current, preserve: hasKeepTag(current) });
  return out;
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

function applyPreserve(chunks: Chunk[], selectors: PreserveSelector[], level: "sections" | "blocks" | "lines"): Chunk[] {
  if (!selectors.length) return chunks;

  for (const sel of selectors) {
    if (sel.type === "tag") {
      if (sel.value === "keep") {
        for (const c of chunks) if (hasKeepTag(c.text)) c.preserve = true;
      }
      continue;
    }

    if (sel.type === "regex") {
      const re = new RegExp(sel.pattern, "m");
      for (const c of chunks) if (re.test(c.text)) c.preserve = true;
      continue;
    }

    if (sel.type === "heading") {
      for (const c of chunks) {
        const heading = extractHeadingValue(c.text, level);
        if (heading && heading === sel.value) c.preserve = true;
      }
      continue;
    }
  }

  return chunks;
}

function extractHeadingValue(text: string, level: "sections" | "blocks" | "lines"): string | null {
  const firstLine = firstNonBlankLine(text);
  if (!firstLine) return null;
  const m = firstLine.match(/^\s{0,3}#{1,6}\s+(.*)$/);
  if (!m) return null;
  const value = m[1].trim();
  if (!value) return null;
  if (level === "lines") return value;
  if (level === "blocks" || level === "sections") return value;
  return value;
}

function firstNonBlankLine(text: string): string | null {
  const lines = text.split("\n");
  for (const l of lines) {
    if (/^\s*$/.test(l)) continue;
    return l;
  }
  return null;
}
