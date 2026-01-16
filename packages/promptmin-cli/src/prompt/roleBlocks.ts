export type PromptRole = "system" | "developer" | "user";

export type PromptMessage = { role: PromptRole; content: string };

export function extractPromptMessages(promptText: string): { hasRoleBlocks: boolean; messages: PromptMessage[] } {
  const lines = splitLinesKeepEnds(promptText);
  const headers: Array<{ idx: number; role: PromptRole; inline: string | null }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = stripLineEnd(lines[i]);
    const m = raw.match(/^(system|developer|user):(?:\s*(\|))?\s*(.*)?$/);
    if (!m) continue;
    const role = m[1] as PromptRole;
    const hasPipe = Boolean(m[2]);
    const tail = (m[3] || "").trimEnd();
    headers.push({ idx: i, role, inline: hasPipe ? null : tail || "" });
  }

  if (headers.length === 0) return { hasRoleBlocks: false, messages: [{ role: "system", content: promptText }] };

  const messages: PromptMessage[] = [];

  const firstHeader = headers[0];
  if (firstHeader.idx > 0) {
    const pre = lines.slice(0, firstHeader.idx).join("");
    if (pre.trim().length) messages.push({ role: "system", content: pre });
  }

  for (let h = 0; h < headers.length; h++) {
    const start = headers[h].idx;
    const end = h + 1 < headers.length ? headers[h + 1].idx : lines.length;
    const header = headers[h];

    if (header.inline !== null) {
      messages.push({ role: header.role, content: header.inline });
      continue;
    }

    const contentLines = lines.slice(start + 1, end);
    const content = deindent(contentLines.join(""));
    messages.push({ role: header.role, content });
  }

  return { hasRoleBlocks: true, messages };
}

export function chunkRoleBlocks(promptText: string): Array<{ role: PromptRole; raw: string }> | null {
  const lines = splitLinesKeepEnds(promptText);
  const starts: Array<{ idx: number; role: PromptRole }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = stripLineEnd(lines[i]);
    const m = raw.match(/^(system|developer|user):/);
    if (!m) continue;
    starts.push({ idx: i, role: m[1] as PromptRole });
  }

  if (starts.length === 0) return null;

  const blocks: Array<{ role: PromptRole; raw: string }> = [];
  for (let s = 0; s < starts.length; s++) {
    const start = starts[s].idx;
    const end = s + 1 < starts.length ? starts[s + 1].idx : lines.length;
    blocks.push({ role: starts[s].role, raw: lines.slice(start, end).join("") });
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

function deindent(text: string): string {
  const lines = text.split("\n");
  let minIndent: number | null = null;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = l.match(/^(\s+)/);
    const indent = m ? m[1].length : 0;
    if (minIndent === null || indent < minIndent) minIndent = indent;
  }
  if (!minIndent) return text;
  return lines.map((l) => (l.startsWith(" ".repeat(minIndent)) ? l.slice(minIndent) : l)).join("\n");
}

