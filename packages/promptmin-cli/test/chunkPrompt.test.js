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
