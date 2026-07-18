import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTranscriptSessionInfo } from "./transcript-session-info";

const testDirectories: string[] = [];

function writeTranscript(lines: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "transcript-session-info-"));
	testDirectories.push(dir);
	const path = join(dir, "session.jsonl");
	writeFileSync(path, lines.join("\n"));
	return path;
}

function codexTokenCount(
	lastTokenUsage: Record<string, number>,
	modelContextWindow?: number,
): string {
	return JSON.stringify({
		type: "event_msg",
		payload: {
			type: "token_count",
			info: {
				total_token_usage: { total_tokens: 999_999 },
				last_token_usage: lastTokenUsage,
				...(modelContextWindow !== undefined
					? { model_context_window: modelContextWindow }
					: {}),
			},
			rate_limits: {},
		},
	});
}

afterEach(() => {
	for (const dir of testDirectories.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("readTranscriptSessionInfo", () => {
	describe("Claude transcripts", () => {
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

			expect(readTranscriptSessionInfo(path)).toEqual({
				contextUsedTokens: 43_002,
			});
		});

		it("returns undefined when no usage entry exists", () => {
			const path = writeTranscript([
				JSON.stringify({ type: "user", message: { content: "hi" } }),
			]);
			expect(readTranscriptSessionInfo(path)).toBeUndefined();
		});

		it("returns undefined for a missing file", () => {
			expect(readTranscriptSessionInfo("/nonexistent/t.jsonl")).toBeUndefined();
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
			expect(readTranscriptSessionInfo(path)).toEqual({
				contextUsedTokens: 55,
			});
		});
	});

	describe("Codex rollouts", () => {
		it("reads used tokens, window, and effort from the last entries", () => {
			const path = writeTranscript([
				JSON.stringify({
					type: "turn_context",
					payload: { turn_id: "t1", cwd: "/x", model: "gpt-5.6-terra" },
				}),
				codexTokenCount({ total_tokens: 50_000, reasoning_output_tokens: 100 }),
				JSON.stringify({
					type: "turn_context",
					payload: {
						turn_id: "t2",
						cwd: "/x",
						model: "gpt-5.6-terra",
						effort: "xhigh",
					},
				}),
				codexTokenCount(
					{
						input_tokens: 139_842,
						cached_input_tokens: 137_984,
						cache_write_input_tokens: 0,
						output_tokens: 2_034,
						reasoning_output_tokens: 269,
						total_tokens: 141_876,
					},
					258_400,
				),
			]);

			expect(readTranscriptSessionInfo(path)).toEqual({
				contextUsedTokens: 141_607,
				contextWindowTokens: 258_400,
				effortLevel: "xhigh",
			});
		});

		it("falls back to collaboration_mode reasoning_effort", () => {
			const path = writeTranscript([
				JSON.stringify({
					type: "turn_context",
					payload: {
						turn_id: "t1",
						model: "gpt-5.6-terra",
						collaboration_mode: { settings: { reasoning_effort: "medium" } },
					},
				}),
				codexTokenCount({ total_tokens: 1_000 }, 258_400),
			]);

			expect(readTranscriptSessionInfo(path)).toEqual({
				contextUsedTokens: 1_000,
				contextWindowTokens: 258_400,
				effortLevel: "medium",
			});
		});

		it("omits effort when the latest turn_context carries none", () => {
			const path = writeTranscript([
				JSON.stringify({
					type: "turn_context",
					payload: { turn_id: "t1", model: "gpt-5.6-terra", effort: "high" },
				}),
				codexTokenCount({ total_tokens: 2_000 }, 258_400),
				// Latest turn_context omits effort (= default) — the older "high"
				// must not leak through.
				JSON.stringify({
					type: "turn_context",
					payload: { turn_id: "t2", model: "gpt-5.6-terra" },
				}),
			]);

			expect(readTranscriptSessionInfo(path)).toEqual({
				contextUsedTokens: 2_000,
				contextWindowTokens: 258_400,
			});
		});

		it("returns effort alone when no token_count exists yet", () => {
			const path = writeTranscript([
				JSON.stringify({
					type: "turn_context",
					payload: { turn_id: "t1", model: "gpt-5.6-terra", effort: "low" },
				}),
			]);

			expect(readTranscriptSessionInfo(path)).toEqual({ effortLevel: "low" });
		});

		it("ignores token_count mentions inside message content", () => {
			const path = writeTranscript([
				codexTokenCount({ total_tokens: 3_000 }, 258_400),
				JSON.stringify({
					type: "response_item",
					payload: { text: 'discussing "token_count" and "turn_context"' },
				}),
			]);

			expect(readTranscriptSessionInfo(path)).toEqual({
				contextUsedTokens: 3_000,
				contextWindowTokens: 258_400,
			});
		});
	});
});
