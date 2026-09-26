import { describe, expect, it } from "bun:test";
import { isTrustedTranscriptPath } from "./transcript-path";

describe("isTrustedTranscriptPath", () => {
	it("keeps absolute .jsonl paths under home and drops the rest", () => {
		const home = "/home/u";
		expect(
			isTrustedTranscriptPath(
				"/home/u/.claude/projects/p/s/subagents/agent-a.jsonl",
				home,
			),
		).toBe(true);
		expect(
			isTrustedTranscriptPath(
				"/home/u/.codex/sessions/2026/09/06/rollout-x.jsonl",
				home,
			),
		).toBe(true);
		expect(isTrustedTranscriptPath("/etc/passwd", home)).toBe(false);
		expect(isTrustedTranscriptPath("/home/u/../root/x.jsonl", home)).toBe(
			false,
		);
		expect(isTrustedTranscriptPath("relative/x.jsonl", home)).toBe(false);
		expect(isTrustedTranscriptPath("/home/u/notes.txt", home)).toBe(false);
	});
});
