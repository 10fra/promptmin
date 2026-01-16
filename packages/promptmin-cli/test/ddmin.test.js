import test from "node:test";
import assert from "node:assert/strict";

import { ddminReduce } from "../dist/minimize/ddmin.js";

test("ddminReduce finds minimal failing subset", async () => {
  const items = ["a\n", "b\n", "BAD\n", "c\n"];
  const reduced = await ddminReduce({
    items,
    isFail: async (xs) => xs.join("").includes("BAD"),
  });
  assert.deepEqual(reduced, ["BAD\n"]);
});

