import fs from "node:fs/promises";

export async function writeJsonlAppend(filePath: string | null, obj: unknown): Promise<void> {
  if (!filePath) return;
  await fs.appendFile(filePath, JSON.stringify(obj) + "\n", "utf8");
}
