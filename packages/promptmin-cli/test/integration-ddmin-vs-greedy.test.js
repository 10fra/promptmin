import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("ddmin beats greedy on non-monotonic fixture", async () => {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(pkgDir, "..", "..");
  const cliPath = path.join(pkgDir, "dist", "cli.js");

  const promptPath = path.join(repoRoot, "examples", "prompts", "parity.md");
  const configPath = path.join(repoRoot, "examples", "configs", "promptmin.parity.config.json");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-int-"));
  const outGreedy = path.join(tmp, "greedy");
  const outDdmin = path.join(tmp, "ddmin");

  const common = [
    "minimize",
    "--prompt",
    promptPath,
    "--config",
    configPath,
    "--target",
    "test:parity_odd_01",
    "--cache",
    "off",
    "--stability-mode",
    "off",
  ];

  const greedy = spawnSync(process.execPath, [cliPath, ...common, "--out", outGreedy, "--strategy", "greedy"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  assert.equal(greedy.status, 0);

  const ddmin = spawnSync(process.execPath, [cliPath, ...common, "--out", outDdmin, "--strategy", "ddmin"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  assert.equal(ddmin.status, 0);

  const greedyText = await fs.readFile(path.join(outGreedy, "minimized.prompt"), "utf8");
  const ddminText = await fs.readFile(path.join(outDdmin, "minimized.prompt"), "utf8");

  const greedyCount = (greedyText.match(/\bODD_TOKEN_[A-Z]\b/g) || []).length;
  const ddminCount = (ddminText.match(/\bODD_TOKEN_[A-Z]\b/g) || []).length;
  assert.equal(greedyCount, 3);
  assert.equal(ddminCount, 1);
});
