import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createBudgetState, evaluateTarget } from "../dist/eval/evaluateTarget.js";

test("openai_responses runner hits /responses and caches output", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-openai-"));
  const tracePath = path.join(tmp, "trace.jsonl");
  const cacheDir = path.join(tmp, "cache");
  await fs.writeFile(tracePath, "", "utf8");

  let requestCount = 0;
  const server = http.createServer(async (req, res) => {
    requestCount++;
    try {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/v1/responses");
      assert.equal(req.headers.authorization, "Bearer test-key");

      const body = await new Promise((resolve) => {
        let buf = "";
        req.on("data", (d) => (buf += String(d)));
        req.on("end", () => resolve(buf));
      });
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, "gpt-test");
      assert.ok(Array.isArray(parsed.input));
      assert.equal(parsed.input[0].role, "system");
      assert.equal(parsed.input[0].content, "system prompt");

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "OK" }],
            },
          ],
        }),
      );
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e?.stack || e));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  process.env.OPENAI_API_KEY = "test-key";

  const config = {
    runner: { type: "openai_responses", model: "gpt-test", base_url: baseUrl, temperature: 0, max_output_tokens: 20 },
    tests: [{ id: "t1", input: { user: "hi" }, assert: { type: "regex_match", pattern: "OK" } }],
  };

  const budget = createBudgetState({ maxRuns: 1, startedAt: Date.now(), maxMillis: 60_000 });

  try {
    const r1 = await evaluateTarget({
      config,
      promptText: "system prompt",
      promptHint: "baseline",
      outDirAbs: tmp,
      targetSelector: "test:t1",
      tracePath,
      budget,
      verbose: false,
      cache: { enabled: true, dirAbs: cacheDir },
      stability: { mode: "off" },
    });
    assert.equal(r1.isFail, false);
    assert.equal(budget.runsUsed, 1);
    assert.equal(requestCount, 1);

    const r2 = await evaluateTarget({
      config,
      promptText: "system prompt",
      promptHint: "baseline",
      outDirAbs: tmp,
      targetSelector: "test:t1",
      tracePath,
      budget,
      verbose: false,
      cache: { enabled: true, dirAbs: cacheDir },
      stability: { mode: "off" },
    });
    assert.equal(r2.isFail, false);
    assert.equal(budget.runsUsed, 1);
    assert.equal(requestCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("openai_responses runner parses yaml-ish role blocks", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-openai-roles-"));
  const tracePath = path.join(tmp, "trace.jsonl");
  const cacheDir = path.join(tmp, "cache");
  await fs.writeFile(tracePath, "", "utf8");

  const server = http.createServer(async (req, res) => {
    try {
      const body = await new Promise((resolve) => {
        let buf = "";
        req.on("data", (d) => (buf += String(d)));
        req.on("end", () => resolve(buf));
      });
      const parsed = JSON.parse(body);
      assert.equal(parsed.input[0].role, "system");
      assert.match(parsed.input[0].content, /S1/);
      assert.equal(parsed.input[1].role, "developer");
      assert.match(parsed.input[1].content, /D1/);
      assert.equal(parsed.input[2].role, "user");
      assert.match(parsed.input[2].content, /U1/);
      assert.equal(parsed.input[3].role, "user");
      assert.match(parsed.input[3].content, /hi/);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ output_text: "OK" }));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e?.stack || e));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  process.env.OPENAI_API_KEY = "test-key";

  const config = {
    runner: { type: "openai_responses", model: "gpt-test", base_url: baseUrl, temperature: 0, max_output_tokens: 20 },
    tests: [{ id: "t1", input: { user: "hi" }, assert: { type: "regex_match", pattern: "OK" } }],
  };

  const budget = createBudgetState({ maxRuns: 1, startedAt: Date.now(), maxMillis: 60_000 });
  const promptText = "system: |\n  S1\ndeveloper: |\n  D1\nuser: |\n  U1\n";

  try {
    const r = await evaluateTarget({
      config,
      promptText,
      promptHint: "baseline",
      outDirAbs: tmp,
      targetSelector: "test:t1",
      tracePath,
      budget,
      verbose: false,
      cache: { enabled: true, dirAbs: cacheDir },
      stability: { mode: "off" },
    });
    assert.equal(r.isFail, false);
    assert.equal(budget.runsUsed, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
