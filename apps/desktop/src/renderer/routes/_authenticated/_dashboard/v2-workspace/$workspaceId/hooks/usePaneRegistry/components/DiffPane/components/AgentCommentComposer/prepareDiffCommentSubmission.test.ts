import { describe, expect, test } from "bun:test";
import type { AgentTarget } from "./hooks/useDiffCommentTarget";
import { prepareDiffCommentSubmission } from "./prepareDiffCommentSubmission";

const existingTarget: AgentTarget = {
	kind: "existing",
	terminalId: "term-1",
};

describe("prepareDiffCommentSubmission", () => {
	test("passes the trimmed comment and target through unchanged", () => {
		expect(
			prepareDiffCommentSubmission({
				text: "  please refactor this  ",
				target: existingTarget,
			}),
		).toEqual({ comment: "please refactor this", target: existingTarget });
	});

	test("preserves serialized @file mentions and /slash text verbatim", () => {
		// The rich editor serializes chips back to plain text; the composer must
		// forward that exact string (minus outer whitespace) so agent grounding
		// is identical to the old <textarea>.
		const text = "/review @src/index.ts explain this change";
		expect(
			prepareDiffCommentSubmission({ text, target: existingTarget }),
		).toEqual({ comment: text, target: existingTarget });
	});

	test("returns null when the comment is empty or whitespace-only", () => {
		expect(
			prepareDiffCommentSubmission({ text: "", target: existingTarget }),
		).toBeNull();
		expect(
			prepareDiffCommentSubmission({
				text: "   \n\t ",
				target: existingTarget,
			}),
		).toBeNull();
	});

	test("returns null when no agent target is resolved yet", () => {
		expect(
			prepareDiffCommentSubmission({ text: "do the thing", target: null }),
		).toBeNull();
	});
});
