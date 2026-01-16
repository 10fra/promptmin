import { TestConfig } from "../config/loadConfig.js";
import { validateJsonSchemaLite } from "./jsonSchemaLite.js";

export function assertOutput(params: { output: string; test: TestConfig }): { ok: true } | { ok: false; reason: string } {
  const { output, test } = params;
  const a = test.assert as any;

  if (a.type === "contains") {
    return output.includes(a.value) ? { ok: true } : { ok: false, reason: `expected contains: ${a.value}` };
  }
  if (a.type === "not_contains") {
    return output.includes(a.value) ? { ok: false, reason: `expected not_contains: ${a.value}` } : { ok: true };
  }
  if (a.type === "regex_match") {
    const re = new RegExp(a.pattern, "m");
    return re.test(output) ? { ok: true } : { ok: false, reason: `expected regex_match: ${a.pattern}` };
  }
  if (a.type === "regex_not_match") {
    const re = new RegExp(a.pattern, "m");
    return re.test(output) ? { ok: false, reason: `expected regex_not_match: ${a.pattern}` } : { ok: true };
  }
  if (a.type === "json_schema") {
    let value: unknown;
    try {
      value = JSON.parse(output);
    } catch {
      return { ok: false, reason: "output not valid JSON" };
    }
    const validated = validateJsonSchemaLite(value, a.schema);
    return validated.ok ? { ok: true } : { ok: false, reason: `json_schema: ${validated.error}` };
  }

  return { ok: false, reason: `unsupported assert.type: ${String(a.type)}` };
}

