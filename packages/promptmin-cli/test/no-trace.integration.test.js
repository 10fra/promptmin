import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("--no-trace-output does not write trace.jsonl", async () => {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(pkgDir, "..", "..");
  const cliPath = path.join(pkgDir, "dist", "cli.js");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-notrace-"));
  const promptPath = path.join(tmp, "prompt.txt");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "BAD_TOKEN\n", "utf8");
  const python = "import os; print('BAD' if 'BAD_TOKEN' in os.environ.get('PROMPT_TEXT','') else 'OK')";
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        runner: { type: "local_command", command: ["python3", "-c", python] },
        tests: [{ id: "t1", input: {}, assert: { type: "regex_not_match", pattern: "BAD" } }],
      },
      null,
      2,
    ),
    "utf8",
  );

  const res = spawnSync(
    process.execPath,
    [
      cliPath,
      "minimize",
      "--prompt",
      promptPath,
      "--config",
      configPath,
      "--out",
      outDir,
      "--target",
      "test:t1",
      "--no-trace-output",
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  assert.equal(res.status, 0);

  await assert.rejects(() => fs.access(path.join(outDir, "trace.jsonl")));
  const meta = JSON.parse(await fs.readFile(path.join(outDir, "meta.json"), "utf8"));
  assert.equal(meta.paths.trace, null);
});

