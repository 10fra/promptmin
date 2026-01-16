import fs from "node:fs/promises";
import path from "node:path";

export type RunnerConfig = { type: "local_command"; command: string[] };

export type AssertConfig =
  | { type: "contains"; value: string }
  | { type: "not_contains"; value: string }
  | { type: "regex_match"; pattern: string }
  | { type: "regex_not_match"; pattern: string }
  | { type: "json_schema"; schema: unknown };

export type TestConfig = {
  id: string;
  input: Record<string, unknown>;
  assert: AssertConfig;
};

export type PromptminConfig = {
  runner: RunnerConfig;
  tests: TestConfig[];
};

export async function loadConfig(configPath: string): Promise<PromptminConfig> {
  const abs = path.resolve(configPath);
  const raw = await fs.readFile(abs, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeConfig(parsed);
}

function normalizeConfig(config: unknown): PromptminConfig {
  if (!config || typeof config !== "object") throw new Error("config must be an object");
  const runner = (config as any).runner;
  const tests = (config as any).tests;
  if (!runner || typeof runner !== "object") throw new Error("config.runner required");
  if (!Array.isArray(tests)) throw new Error("config.tests must be an array");

  const runnerType = String((runner as any).type || "");
  if (runnerType === "local_command") {
    const command = (runner as any).command;
    if (!Array.isArray(command) || command.some((x: any) => typeof x !== "string")) {
      throw new Error("runner.command must be string[] for local_command");
    }
    return {
      runner: { type: "local_command", command },
      tests: tests.map(normalizeTest),
    };
  }

  throw new Error(`unsupported runner.type: ${runnerType || "(missing)"}`);
}

function normalizeTest(t: any): TestConfig {
  if (!t || typeof t !== "object") throw new Error("each test must be an object");
  const id = String(t.id || "");
  if (!id) throw new Error("test.id required");
  const input = t.input && typeof t.input === "object" ? t.input : {};
  const assert = normalizeAssert(t.assert);
  return { id, input, assert };
}

function normalizeAssert(a: any): AssertConfig {
  if (!a || typeof a !== "object") throw new Error("test.assert required");
  const type = String(a.type || "");
  if (type === "contains" || type === "not_contains") return { type, value: String(a.value || "") } as any;
  if (type === "regex_match" || type === "regex_not_match")
    return { type, pattern: String(a.pattern || "") } as any;
  if (type === "json_schema") return { type, schema: a.schema };
  throw new Error(`unsupported assert.type: ${type}`);
}
