import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("writes candidate prompt snapshots under out/candidates", async () => {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(pkgDir, "..", "..");
  const cliPath = path.join(pkgDir, "dist", "cli.js");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-candidates-"));
  const promptPath = path.join(tmp, "prompt.md");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "A\n\nBAD_TOKEN\n", "utf8");
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
      "--strategy",
      "ddmin",
      "--granularity",
      "blocks",
      "--budget-runs",
      "10",
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  assert.equal(res.status, 0);

  const candidatesDir = path.join(outDir, "candidates");
  const files = (await fs.readdir(candidatesDir)).filter((f) => f.endsWith(".prompt"));
  assert.ok(files.length >= 1);
});

