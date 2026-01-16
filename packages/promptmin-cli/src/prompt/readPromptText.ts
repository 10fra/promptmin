import fs from "node:fs/promises";
import path from "node:path";

export async function readPromptText(promptPath: string): Promise<string> {
  const abs = path.resolve(promptPath);
  return await fs.readFile(abs, "utf8");
}

