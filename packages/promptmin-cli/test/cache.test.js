import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createBudgetState, evaluateTarget } from "../dist/eval/evaluateTarget.js";

test("disk cache avoids consuming budget on cache hit", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-cache-"));
  const tracePath = path.join(tmp, "trace.jsonl");
  const cacheDir = path.join(tmp, "cache");
  await fs.writeFile(tracePath, "", "utf8");

  const config = {
    runner: { type: "local_command", command: ["python3", "-c", "import time; print(time.time_ns())"] },
    tests: [{ id: "t1", input: {}, assert: { type: "regex_match", pattern: "\\\\d+" } }],
  };

  const budget = createBudgetState({ maxRuns: 1, startedAt: Date.now(), maxMillis: 60_000 });

  await evaluateTarget({
    config,
    promptText: "x",
    promptHint: "t",
    outDirAbs: tmp,
    targetSelector: "suite:any",
    tracePath,
    budget,
    verbose: false,
    cache: { enabled: true, dirAbs: cacheDir },
  });
  assert.equal(budget.runsUsed, 1);

  await evaluateTarget({
    config,
    promptText: "x",
    promptHint: "t",
    outDirAbs: tmp,
    targetSelector: "suite:any",
    tracePath,
    budget,
    verbose: false,
    cache: { enabled: true, dirAbs: cacheDir },
  });
  assert.equal(budget.runsUsed, 1);

  const lines = (await fs.readFile(tracePath, "utf8")).trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.kind, "eval");
  assert.equal(last.cache_hit, true);
});

