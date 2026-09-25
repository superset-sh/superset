import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type RecordedFrame = { direction: "in" | "out"; frame: unknown };

export const CODEX_FIXTURES = [
	"text",
	"command",
	"fileChange",
	"fileEdit",
	"approval",
	"interrupt",
] as const;

export type CodexFixtureName = (typeof CODEX_FIXTURES)[number];

export function loadCodexFixture(name: CodexFixtureName): RecordedFrame[] {
	const path = join(dirname(fileURLToPath(import.meta.url)), `${name}.jsonl`);
	return readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as RecordedFrame);
}

export function fixtureCwd(frames: RecordedFrame[]): string {
	for (const { frame } of frames) {
		const params = (frame as { method?: string; params?: { cwd?: string } })
			.params;
		if (
			(frame as { method?: string }).method === "thread/start" &&
			params?.cwd
		) {
			return params.cwd;
		}
	}
	throw new Error("fixture has no thread/start cwd");
}
