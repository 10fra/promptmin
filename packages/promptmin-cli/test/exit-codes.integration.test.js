import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function cliInfo() {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(pkgDir, "..", "..");
  const cliPath = path.join(pkgDir, "dist", "cli.js");
  return { pkgDir, repoRoot, cliPath };
}

async function writeJson(filePath, obj) {
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

test("exit 2 when baseline does not fail", async () => {
  const { repoRoot, cliPath } = cliInfo();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-exit2-"));
  const promptPath = path.join(tmp, "prompt.txt");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "hello\n", "utf8");
  await writeJson(configPath, {
    runner: { type: "local_command", command: ["python3", "-c", "print('OK')"] },
    tests: [{ id: "t1", input: {}, assert: { type: "regex_match", pattern: "OK" } }],
  });

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
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  assert.equal(res.status, 2);
  await fs.access(path.join(outDir, "report.md"));
});

test("exit 3 when budget exceeded during minimization (best-so-far)", async () => {
  const { repoRoot, cliPath } = cliInfo();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-exit3-"));
  const promptPath = path.join(tmp, "prompt.txt");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "A\n\nBAD_TOKEN\n", "utf8");
  const python = "import os; print('BAD' if 'BAD_TOKEN' in os.environ.get('PROMPT_TEXT','') else 'OK')";
  await writeJson(configPath, {
    runner: { type: "local_command", command: ["python3", "-c", python] },
    tests: [{ id: "t1", input: {}, assert: { type: "regex_not_match", pattern: "BAD" } }],
  });

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
      "1",
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  assert.equal(res.status, 3);
  await fs.access(path.join(outDir, "report.md"));
  await fs.access(path.join(outDir, "minimized.prompt"));
  const report = await fs.readFile(path.join(outDir, "report.md"), "utf8");
  assert.match(report, /## Best-so-far/);
});

test("exit 4 on runner error", async () => {
  const { repoRoot, cliPath } = cliInfo();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-exit4-"));
  const promptPath = path.join(tmp, "prompt.txt");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "x\n", "utf8");
  await writeJson(configPath, {
    runner: { type: "local_command", command: ["python3", "-c", "import sys; sys.exit(1)"] },
    tests: [{ id: "t1", input: {}, assert: { type: "regex_match", pattern: "OK" } }],
  });

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
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  assert.equal(res.status, 4);
  await fs.access(path.join(outDir, "report.md"));
});
