import { spawn } from "node:child_process";
import { TestConfig } from "../config/loadConfig.js";

export async function runLocalCommand(params: {
  command: string[];
  promptText: string;
  promptFile?: string;
  test: TestConfig;
  trialIndex?: number;
  trialCount?: number;
}): Promise<string> {
  const [cmd, ...args] = params.command;
  if (!cmd) throw new Error("runner.command empty");

  const promptFile = params.promptFile;
  if (!promptFile) throw new Error("missing promptFile");

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PROMPT_FILE: promptFile,
        PROMPT_TEXT: params.promptText,
        TEST_JSON: JSON.stringify(params.test),
        TEST_ID: params.test.id,
        PROMPTMIN_TRIAL_INDEX: String(params.trialIndex ?? 0),
        PROMPTMIN_TRIAL_COUNT: String(params.trialCount ?? 1),
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
