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

test("stability kofn treats >=k failures as fail", async () => {
  const { repoRoot, cliPath } = cliInfo();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-kofn-"));
  const promptPath = path.join(tmp, "prompt.txt");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "BAD_TOKEN\n", "utf8");
  const python =
    "import os; i=int(os.environ.get('PROMPTMIN_TRIAL_INDEX','0')); bad=('BAD_TOKEN' in os.environ.get('PROMPT_TEXT','')); print('BAD' if (bad and i<2) else 'OK')";
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
      "lines",
      "--budget-runs",
      "30",
      "--stability-mode",
      "kofn",
      "--stability-n",
      "3",
      "--stability-k",
      "2",
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  assert.equal(res.status, 0);

  const minimized = await fs.readFile(path.join(outDir, "minimized.prompt"), "utf8");
  assert.match(minimized, /BAD_TOKEN/);

  const report = await fs.readFile(path.join(outDir, "report.md"), "utf8");
  assert.match(report, /stability: `kofn \(k=2, n=3\)`/);
  assert.match(report, /test `t1`: failures=2\/3/);
});

