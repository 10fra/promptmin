import fs from "node:fs/promises";

export async function writeJsonlAppend(filePath: string, obj: unknown): Promise<void> {
  await fs.appendFile(filePath, JSON.stringify(obj) + "\n", "utf8");
}

