import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("local_command runner provides PROMPT_FILE + TEST_ID env", async () => {
  const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(pkgDir, "..", "..");
  const cliPath = path.join(pkgDir, "dist", "cli.js");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-runner-env-"));
  const promptPath = path.join(tmp, "prompt.txt");
  const configPath = path.join(tmp, "config.json");
  const outDir = path.join(tmp, "out");

  await fs.writeFile(promptPath, "hello world\n", "utf8");

  const python = [
    "import os,sys,pathlib",
    "p=os.environ.get('PROMPT_FILE','')",
    "tid=os.environ.get('TEST_ID','')",
    "ok=bool(p) and pathlib.Path(p).exists() and ('hello world' in pathlib.Path(p).read_text()) and (tid=='t1')",
    "print('OK' if ok else 'BAD')",
    "sys.exit(0)",
  ].join(";");

  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        runner: { type: "local_command", command: ["python3", "-c", python] },
        tests: [{ id: "t1", input: {}, assert: { type: "regex_match", pattern: "OK" } }],
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
      "--cache",
      "off",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );

  assert.equal(res.status, 2);
});

