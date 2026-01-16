type Result = { ok: true } | { ok: false; error: string };

export function validateJsonSchemaLite(value: unknown, schema: unknown): Result {
  if (!schema || typeof schema !== "object") return { ok: false, error: "schema must be an object" };
  const s: any = schema;
  const type = s.type;

  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "expected object" };
    const obj = value as Record<string, unknown>;
    const required: string[] = Array.isArray(s.required) ? s.required : [];
    for (const key of required) {
      if (!(key in obj)) return { ok: false, error: `missing required: ${key}` };
    }
    const props = s.properties && typeof s.properties === "object" ? s.properties : {};
    for (const [key, propSchema] of Object.entries(props)) {
      if (!(key in obj)) continue;
      const r = validateJsonSchemaLite(obj[key], propSchema);
      if (!r.ok) return { ok: false, error: `${key}: ${r.error}` };
    }
    return { ok: true };
  }

  if (type === "string") return typeof value === "string" ? { ok: true } : { ok: false, error: "expected string" };
  if (type === "number") return typeof value === "number" ? { ok: true } : { ok: false, error: "expected number" };
  if (type === "boolean") return typeof value === "boolean" ? { ok: true } : { ok: false, error: "expected boolean" };
  if (type === "array") return Array.isArray(value) ? { ok: true } : { ok: false, error: "expected array" };

  return { ok: false, error: `unsupported schema type: ${String(type)}` };
}

