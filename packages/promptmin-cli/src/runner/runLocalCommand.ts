import { spawn } from "node:child_process";
import { TestConfig } from "../config/loadConfig.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function runLocalCommand(params: {
  command: string[];
  promptText: string;
  promptFile?: string;
  test: TestConfig;
}): Promise<string> {
  const [cmd, ...args] = params.command;
  if (!cmd) throw new Error("runner.command empty");

  const promptFile = await resolvePromptFile(params.promptText, params.promptFile);

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PROMPT_FILE: promptFile,
        PROMPT_TEXT: params.promptText,
        TEST_JSON: JSON.stringify(params.test),
        TEST_ID: params.test.id,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(stdout);
      reject(new Error(`runner exit ${code}: ${stderr || stdout}`));
    });
  });
}

async function resolvePromptFile(promptText: string, existing?: string): Promise<string> {
  if (existing) return existing;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "promptmin-prompt-"));
  const filePath = path.join(dir, "prompt.txt");
  await fs.writeFile(filePath, promptText, "utf8");
  return filePath;
}
