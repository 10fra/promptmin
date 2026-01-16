import test from "node:test";
import assert from "node:assert/strict";

import { validateJsonSchemaLite } from "../dist/eval/jsonSchemaLite.js";

test("jsonSchemaLite object required + types", () => {
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  };

  assert.deepEqual(validateJsonSchemaLite({ name: "a" }, schema), { ok: true });
  assert.equal(validateJsonSchemaLite({ }, schema).ok, false);
  assert.equal(validateJsonSchemaLite({ name: 1 }, schema).ok, false);
});

