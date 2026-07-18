import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTranscriptContextTokens } from "./transcript-context";

const testDirectories: string[] = [];

function writeTranscript(lines: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "transcript-context-"));
	testDirectories.push(dir);
	const path = join(dir, "session.jsonl");
	writeFileSync(path, lines.join("\n"));
	return path;
}

afterEach(() => {
	for (const dir of testDirectories.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("readTranscriptContextTokens", () => {
	it("sums input and cache tokens from the last usage entry", () => {
		const path = writeTranscript([
			JSON.stringify({
				type: "assistant",
				message: {
					usage: { input_tokens: 10, cache_read_input_tokens: 100 },
				},
			}),
			JSON.stringify({ type: "user", message: { content: "hi" } }),
			JSON.stringify({
				type: "assistant",
				message: {
					usage: {
						input_tokens: 2,
						cache_creation_input_tokens: 20_000,
						cache_read_input_tokens: 23_000,
						output_tokens: 4,
					},
				},
			}),
		]);

		expect(readTranscriptContextTokens(path)).toBe(43_002);
	});

	it("returns undefined when no usage entry exists", () => {
		const path = writeTranscript([
			JSON.stringify({ type: "user", message: { content: "hi" } }),
		]);
		expect(readTranscriptContextTokens(path)).toBeUndefined();
	});

	it("returns undefined for a missing file", () => {
		expect(readTranscriptContextTokens("/nonexistent/t.jsonl")).toBeUndefined();
	});

	it("skips malformed lines and non-message usage mentions", () => {
		const path = writeTranscript([
			JSON.stringify({
				type: "assistant",
				message: { usage: { input_tokens: 5, cache_read_input_tokens: 50 } },
			}),
			'{"broken json "usage" line',
			JSON.stringify({ type: "summary", note: 'mentions "usage" only' }),
		]);
		expect(readTranscriptContextTokens(path)).toBe(55);
	});
});
