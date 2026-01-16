export function redactSecrets(text: string): string {
  let out = text;
  out = out.replace(/\bsk-[A-Za-z0-9]{20,}\b/g, "sk-REDACTED");
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, "AKIAREDACTED");
  out = out.replace(/\bASIA[0-9A-Z]{16}\b/g, "ASIAREDACTED");
  return out;
}

