#!/usr/bin/env node
import { minimizeCommand } from "./commands/minimize.js";

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "-h" || command === "--help") {
    process.stdout.write(helpText());
    process.exit(0);
  }

  if (command === "minimize") {
    const exitCode = await minimizeCommand(rest);
    process.exit(exitCode);
  }

  process.stderr.write(`Unknown command: ${command}\n\n`);
  process.stderr.write(helpText());
  process.exit(1);
}

function helpText(): string {
  return [
    "promptmin",
    "",
    "Commands:",
    "  promptmin minimize --prompt <path> --config <path> [--out <dir>]",
    "",
  ].join("\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});

