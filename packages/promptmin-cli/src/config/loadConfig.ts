import fs from "node:fs/promises";
import path from "node:path";

export type LocalCommandRunnerConfig = { type: "local_command"; command: string[] };

export type OpenAIResponsesRunnerConfig = {
  type: "openai_responses";
  model: string;
  temperature?: number;
  max_output_tokens?: number;
  timeout_ms?: number;
  base_url?: string;
  api_key_env?: string;
  max_retries?: number;
};

export type RunnerConfig = LocalCommandRunnerConfig | OpenAIResponsesRunnerConfig;

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

export type PreserveSelector =
  | { type: "heading"; value: string }
  | { type: "tag"; value: string }
  | { type: "regex"; pattern: string };

export type PromptminConfig = {
  runner: RunnerConfig;
  tests: TestConfig[];
  prompt?: {
    preserve?: PreserveSelector[];
  };
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
  const prompt = (config as any).prompt;
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
      prompt: normalizePrompt(prompt),
    };
  }

  if (runnerType === "openai_responses") {
    const model = String((runner as any).model || "");
    if (!model) throw new Error("runner.model required for openai_responses");
    const temperature = (runner as any).temperature;
    const maxOutputTokens = (runner as any).max_output_tokens;
    const timeoutMs = (runner as any).timeout_ms;
    const baseUrl = (runner as any).base_url;
    const apiKeyEnv = (runner as any).api_key_env;
    const maxRetries = (runner as any).max_retries;
    return {
      runner: {
        type: "openai_responses",
        model,
        temperature: temperature === undefined ? undefined : Number(temperature),
        max_output_tokens: maxOutputTokens === undefined ? undefined : Number(maxOutputTokens),
        timeout_ms: timeoutMs === undefined ? undefined : Number(timeoutMs),
        base_url: baseUrl === undefined ? undefined : String(baseUrl),
        api_key_env: apiKeyEnv === undefined ? undefined : String(apiKeyEnv),
        max_retries: maxRetries === undefined ? undefined : Number(maxRetries),
      },
      tests: tests.map(normalizeTest),
      prompt: normalizePrompt(prompt),
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

function normalizePrompt(p: any): PromptminConfig["prompt"] | undefined {
  if (!p) return undefined;
  if (typeof p !== "object") throw new Error("config.prompt must be an object");
  const preserve = Array.isArray(p.preserve) ? p.preserve.map(normalizePreserveSelector) : undefined;
  return { preserve: preserve?.filter(Boolean) as PreserveSelector[] | undefined };
}

function normalizePreserveSelector(x: any): PreserveSelector {
  if (!x || typeof x !== "object") throw new Error("prompt.preserve entries must be objects");
  const type = String(x.type || "");
  if (type === "heading") return { type, value: String(x.value || "") };
  if (type === "tag") return { type, value: String(x.value || "") };
  if (type === "regex") return { type, pattern: String(x.pattern || "") };
  throw new Error(`unsupported preserve selector type: ${type}`);
}
