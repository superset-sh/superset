import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));

export const CLAUDE_FIXTURES = [
	"text-reply",
	"bash-run",
	"edit-approved",
	"edit-declined",
	"abort-mid-tool",
	"subagent-task",
] as const;

export type ClaudeFixture = (typeof CLAUDE_FIXTURES)[number];

export function loadFixture(name: ClaudeFixture): unknown[] {
	return readFileSync(resolve(DIR, `${name}.jsonl`), "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line));
}
