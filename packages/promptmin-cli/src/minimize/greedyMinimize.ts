import { PromptminConfig } from "../config/loadConfig.js";
import { Budget, EvalResult, evaluateTarget } from "../eval/evaluateTarget.js";
import { hashText } from "../util/hash.js";
import { writeJsonlAppend } from "../util/jsonl.js";

export type Chunk = { id: string; text: string };

export async function greedyMinimize(params: {
  config: PromptminConfig;
  baselineText: string;
  baselineEval: EvalResult;
  chunks: Chunk[];
  outDirAbs: string;
  targetSelector: string;
  tracePath: string;
  budget: Budget;
  verbose: boolean;
}): Promise<{ minimizedText: string; finalEval: EvalResult; exitCode: number }> {
  const { chunks } = params;
  let keep = chunks.map(() => true);
  let currentText = chunks.filter((_, i) => keep[i]).map((c) => c.text).join("");
  let currentEval = params.baselineEval;

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < chunks.length; i++) {
      if (!keep[i]) continue;
      const nextKeep = keep.slice();
      nextKeep[i] = false;
      const candidateText = chunks.filter((_, j) => nextKeep[j]).map((c) => c.text).join("");
      if (!candidateText.trim()) continue;

      const candidateEval = await evaluateTarget({
        config: params.config,
        promptText: candidateText,
        promptHint: `drop:${chunks[i].id}`,
        outDirAbs: params.outDirAbs,
        targetSelector: params.targetSelector,
        tracePath: params.tracePath,
        budget: params.budget,
        verbose: params.verbose,
      });

      await writeJsonlAppend(params.tracePath, {
        at: new Date().toISOString(),
        kind: "candidate",
        removed: chunks[i].id,
        prompt_hash: hashText(candidateText),
        kept_chunks: nextKeep.filter(Boolean).length,
        is_fail: candidateEval.isFail,
      });

      if (candidateEval.isFail) {
        keep = nextKeep;
        currentText = candidateText;
        currentEval = candidateEval;
        changed = true;
        if (params.verbose) process.stderr.write(`[keep dropping] ${chunks[i].id}\n`);
      }
    }
  }

  const exitCode = currentEval.isFail ? 0 : 3;
  return { minimizedText: currentText, finalEval: currentEval, exitCode };
}

