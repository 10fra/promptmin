import fs from "node:fs/promises";
import path from "node:path";

import { ensureDir } from "../util/fs.js";

export type DiskCache = { dirAbs: string };

export async function readCache(cache: DiskCache, key: string): Promise<string | null> {
  const filePath = cachePath(cache, key);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { stdout?: string };
    return typeof parsed.stdout === "string" ? parsed.stdout : null;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    return null;
  }
}

export async function writeCache(cache: DiskCache, key: string, stdout: string): Promise<void> {
  const filePath = cachePath(cache, key);
  await ensureDir(path.dirname(filePath));
  const tmp = filePath + ".tmp";
  await fs.writeFile(tmp, JSON.stringify({ stdout, cached_at: new Date().toISOString() }) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

function cachePath(cache: DiskCache, key: string): string {
  const prefix = key.slice(0, 2) || "xx";
  return path.join(cache.dirAbs, prefix, `${key}.json`);
}

