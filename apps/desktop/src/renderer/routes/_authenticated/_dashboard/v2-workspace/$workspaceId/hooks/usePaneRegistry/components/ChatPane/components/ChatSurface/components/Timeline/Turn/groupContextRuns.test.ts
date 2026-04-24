import { describe, expect, it } from "bun:test";
import type { Part, ToolPart } from "@superset/chat/shared";
import { groupContextRuns } from "./groupContextRuns";

const textPart = (id: string): Part => ({
	id,
	messageID: "a1",
	sessionID: "s",
	type: "text",
	text: "hello",
	time: { start: 0 },
});

const toolPart = (id: string, tool: string): ToolPart => ({
	id,
	messageID: "a1",
	sessionID: "s",
	type: "tool",
	tool,
	state: { kind: "completed", input: {}, output: "" },
	time: { start: 0 },
});

describe("groupContextRuns", () => {
	it("returns [] for empty input", () => {
		expect(groupContextRuns([])).toEqual([]);
	});

	it("passes through non-context parts unchanged", () => {
		const out = groupContextRuns([
			textPart("t1"),
			toolPart("tool1", "shell"),
			textPart("t2"),
		]);
		expect(out).toHaveLength(3);
		expect(out.every((e) => e.kind === "single")).toBe(true);
	});

	it("collapses a run of 2+ context tools into a group", () => {
		const out = groupContextRuns([
			textPart("t1"),
			toolPart("r1", "read"),
			toolPart("g1", "grep"),
			toolPart("r2", "read"),
			textPart("t2"),
		]);
		expect(out).toHaveLength(3);
		expect(out[0]).toMatchObject({ kind: "single" });
		expect(out[1]).toMatchObject({ kind: "context-group" });
		if (out[1]?.kind === "context-group") {
			expect(out[1].parts.map((p) => p.tool)).toEqual(["read", "grep", "read"]);
		}
		expect(out[2]).toMatchObject({ kind: "single" });
	});

	it("keeps a single context tool as a single entry (no group)", () => {
		const out = groupContextRuns([
			toolPart("r1", "read"),
			toolPart("edit1", "edit"),
			toolPart("r2", "read"),
		]);
		// [read, edit, read] — the two reads are NOT adjacent.
		expect(out.map((e) => e.kind)).toEqual(["single", "single", "single"]);
	});

	it("case-insensitive + tool- prefix tolerant", () => {
		const out = groupContextRuns([
			toolPart("t1", "Read"),
			toolPart("t2", "tool-grep"),
			toolPart("t3", "GLOB"),
		]);
		expect(out).toHaveLength(1);
		expect(out[0]?.kind).toBe("context-group");
	});
});
