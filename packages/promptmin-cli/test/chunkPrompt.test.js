import test from "node:test";
import assert from "node:assert/strict";

import { chunkPrompt } from "../dist/prompt/chunkPrompt.js";

test("chunkPrompt blocks keeps delimiters", () => {
  const chunks = chunkPrompt("a\n\nb\n", "blocks");
  const joined = chunks.map((c) => c.text).join("");
  assert.equal(joined, "a\n\nb\n");
});

