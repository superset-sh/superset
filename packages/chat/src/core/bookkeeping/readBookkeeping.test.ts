import { describe, expect, it } from "bun:test";
import { readBookkeeping } from "./readBookkeeping";

const TASK_NOTIFICATION = [
	"<task-notification>",
	"<task-id>ac372f0741ed3e1df</task-id>",
	"<status>completed</status>",
	'<summary>Agent "Summarize docs folder" finished</summary>',
	"<duration_ms>17246</duration_ms>",
	"</task-notification>",
].join("\n");

describe("readBookkeeping", () => {
	it("summarises a Claude task notification the way the CLI does", () => {
		expect(readBookkeeping("claude-acp", TASK_NOTIFICATION)?.label).toBe(
			'Agent "Summarize docs folder" finished · 17s',
		);
	});

	it("falls back to the status when there is no summary", () => {
		expect(
			readBookkeeping(
				"claude-acp",
				"<task-notification><status>failed</status></task-notification>",
			)?.label,
		).toBe("Background agent failed");
	});

	it("names Codex's own context blocks", () => {
		expect(
			readBookkeeping(
				"codex-acp",
				"<environment_context>cwd</environment_context>",
			)?.label,
		).toBe("environment context");
	});

	// The point of splitting readers: one harness's wrappers are not another's,
	// so a tag only counts for the harness that spells it.
	it("does not read one harness's blocks with another's rules", () => {
		expect(readBookkeeping("codex-acp", TASK_NOTIFICATION)).toBeNull();
		expect(
			readBookkeeping(
				"claude-acp",
				"<environment_context>cwd</environment_context>",
			),
		).toBeNull();
	});

	it("reads our own block under any harness, known or not", () => {
		for (const harness of ["claude-acp", "codex-acp", "some-future-agent"]) {
			expect(readBookkeeping(harness, "<roster>brief</roster>")?.label).toBe(
				"roster",
			);
		}
	});

	it("leaves real user messages alone", () => {
		expect(readBookkeeping("claude-acp", "hello")).toBeNull();
		expect(
			readBookkeeping("claude-acp", "<unknown-tag>hi</unknown-tag>"),
		).toBeNull();
		expect(
			readBookkeeping(
				"claude-acp",
				"look at <system-reminder>this</system-reminder> please",
			),
		).toBeNull();
		expect(
			readBookkeeping("claude-acp", "<task-notification>unclosed"),
		).toBeNull();
	});

	it("says nothing for an unknown harness beyond our own block", () => {
		expect(readBookkeeping(undefined, TASK_NOTIFICATION)).toBeNull();
		expect(readBookkeeping("gemini-acp", TASK_NOTIFICATION)).toBeNull();
	});
});
