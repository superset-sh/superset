import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	readSubagentTranscript,
	resolveSubagentTranscriptPath,
} from "./subagent-harnesses";

describe("resolveSubagentTranscriptPath", () => {
	it("prefers Claude's explicit child transcript from SubagentStop", () => {
		expect(
			resolveSubagentTranscriptPath("claude", {
				subagentId: "a1",
				sessionId: "s1",
				transcriptPath: "/p/s1.jsonl",
				agentTranscriptPath: "/p/s1/subagents/agent-a1.jsonl",
			}),
		).toBe("/p/s1/subagents/agent-a1.jsonl");
	});

	it("derives Claude's child file from the parent session transcript", () => {
		expect(
			resolveSubagentTranscriptPath("claude", {
				subagentId: "a1",
				sessionId: "s1",
				transcriptPath: "/p/s1.jsonl",
			}),
		).toBe("/p/s1/subagents/agent-a1.jsonl");
	});

	it("uses Codex's path as given even when its shape resembles Claude", () => {
		expect(
			resolveSubagentTranscriptPath("codex", {
				subagentId: "child",
				sessionId: "child",
				transcriptPath: "/codex/sessions/child.jsonl",
			}),
		).toBe("/codex/sessions/child.jsonl");
	});

	it("uses hook paths as given for an unregistered harness", () => {
		expect(
			resolveSubagentTranscriptPath("future-agent", {
				subagentId: "child",
				transcriptPath: "/future/child.jsonl",
			}),
		).toBe("/future/child.jsonl");
	});
});

describe("readSubagentTranscript", () => {
	it("uses the parent harness instead of inferring a parser from the path", () => {
		const dir = path.join(
			mkdtempSync(path.join(tmpdir(), "subagent-harness-")),
			"subagents",
		);
		mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "agent-child.jsonl");
		writeFileSync(
			file,
			JSON.stringify({
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					id: "m1",
					content: [{ type: "output_text", text: "Codex answer" }],
				},
			}),
		);

		expect(readSubagentTranscript("codex", file)?.entries).toEqual([
			{
				id: "m1",
				kind: "assistant",
				text: "Codex answer",
				timestamp: undefined,
			},
		]);
	});

	it("reads Claude's task description from its transcript sidecar", () => {
		const dir = path.join(
			mkdtempSync(path.join(tmpdir(), "subagent-harness-")),
			"s1",
			"subagents",
		);
		mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "agent-a1.jsonl");
		writeFileSync(
			file,
			JSON.stringify({
				type: "assistant",
				uuid: "a1",
				message: { role: "assistant", content: "Done" },
			}),
		);
		writeFileSync(
			path.join(dir, "agent-a1.meta.json"),
			JSON.stringify({ description: "Count files" }),
		);

		const transcript = readSubagentTranscript("claude", file);
		expect(transcript?.description).toBe("Count files");
		expect(transcript?.entries).toHaveLength(1);
		expect(transcript?.size).toBeGreaterThan(0);
	});

	it("detects a known JSONL shape for an unregistered harness", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "subagent-harness-"));
		const file = path.join(dir, "child.jsonl");
		writeFileSync(
			file,
			JSON.stringify({
				type: "assistant",
				uuid: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Generic answer" }],
				},
			}),
		);

		expect(
			readSubagentTranscript("future-agent", file)?.entries[0],
		).toMatchObject({
			kind: "assistant",
			text: "Generic answer",
		});
	});

	it("returns null before the child has written anything", () => {
		expect(
			readSubagentTranscript("claude", "/nonexistent/agent-x.jsonl"),
		).toBeNull();
	});
});
