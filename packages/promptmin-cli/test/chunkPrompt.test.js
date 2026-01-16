import test from "node:test";
import assert from "node:assert/strict";

import { chunkPrompt } from "../dist/prompt/chunkPrompt.js";

test("chunkPrompt blocks keeps delimiters", () => {
  const chunks = chunkPrompt("a\n\nb\n", "blocks");
  const joined = chunks.map((c) => c.text).join("");
  assert.equal(joined, "a\n\nb\n");
});

test("chunkPrompt marks keep-tag blocks as preserved", () => {
  const chunks = chunkPrompt("a\n<!-- promptmin:keep -->\n\nb\n", "blocks");
  assert.equal(Boolean(chunks[0]?.preserve), true);
});

test("chunkPrompt sections ignore headings in code fences", () => {
  const chunks = chunkPrompt("```md\n# not a heading\n```\n\n# real\nx\n", "sections");
  assert.equal(chunks.length, 2);
});

test("chunkPrompt sections split role blocks", () => {
  const text = "system: |\n  a\nuser: |\n  b\n";
  const chunks = chunkPrompt(text, "sections");
  assert.equal(chunks.length, 2);
  assert.equal(chunks.map((c) => c.text).join(""), text);
});

test("chunkPrompt honors config preserve heading selector", () => {
  const chunks = chunkPrompt("# Safety\nx\n\n# Other\ny\n", "sections", {
    preserve: [{ type: "heading", value: "Safety" }],
  });
  assert.equal(Boolean(chunks[0]?.preserve), true);
  assert.equal(Boolean(chunks[1]?.preserve), false);
});

test("chunkPrompt honors config preserve regex selector", () => {
  const chunks = chunkPrompt("a\n\nSECRET=1\n\nb\n", "blocks", {
    preserve: [{ type: "regex", pattern: "SECRET=\\d+" }],
  });
  assert.equal(chunks.some((c) => c.preserve), true);
});

test("chunkPrompt sentences preserves exact join", () => {
  const text = "One. Two! Three?\n";
  const chunks = chunkPrompt(text, "sentences");
  assert.equal(chunks.map((c) => c.text).join(""), text);
  assert.equal(chunks.length, 3);
});
