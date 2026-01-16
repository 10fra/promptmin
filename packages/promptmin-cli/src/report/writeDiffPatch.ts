import path from "node:path";
import { spawn } from "node:child_process";
import { writeFileAtomic } from "../util/fs.js";

export async function writeDiffPatch(params: {
  outDirAbs: string;
  baselinePromptPath: string;
  minimizedPromptPath: string;
}): Promise<void> {
  const patch = await gitNoIndexDiff(params.baselinePromptPath, params.minimizedPromptPath);
  await writeFileAtomic(path.join(params.outDirAbs, "diff.patch"), patch);
}

function gitNoIndexDiff(a: string, b: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["diff", "--no-index", "--no-color", "--", a, b], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || code === 1) return resolve(out);
      reject(new Error(err || `git diff exited ${code}`));
    });
  });
}

