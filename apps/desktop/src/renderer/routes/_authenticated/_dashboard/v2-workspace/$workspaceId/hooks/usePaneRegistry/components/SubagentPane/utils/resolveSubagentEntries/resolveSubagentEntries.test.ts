import { describe, expect, it } from "bun:test";
import { resolveSubagentEntries } from "./resolveSubagentEntries";

describe("resolveSubagentEntries", () => {
	it("prefers live activeSubagents state", () => {
		const activeSubagents = new Map([
			[
				"tool-1",
				{
					agentType: "explore",
					task: "Find files",
					textDelta: "Searching…",
					toolCalls: [{ name: "bash", isError: false }],
					status: "running" as const,
				},
			],
		]);

		const entries = resolveSubagentEntries({
			toolCallId: "tool-1",
			activeSubagents,
			messages: [],
			fallback: { task: "fallback" },
		});

		expect(entries).toHaveLength(1);
		expect(entries[0]?.[0]).toBe("tool-1");
		expect((entries[0]?.[1] as { task: string }).task).toBe("Find files");
	});

	it("falls back to message history when subagent left the live map", () => {
		const entries = resolveSubagentEntries({
			toolCallId: "tool-2",
			activeSubagents: new Map(),
			messages: [
				{
					id: "msg-1",
					role: "assistant",
					content: [
						{
							type: "tool_call",
							id: "tool-2",
							name: "subagent",
							args: { task: "Summarize", agentType: "explore" },
						},
						{
							type: "tool_result",
							id: "tool-2",
							result: "All done",
							isError: false,
						},
					],
					createdAt: new Date(),
				},
			] as never,
			fallback: {},
		});

		expect(entries).toHaveLength(1);
		expect((entries[0]?.[1] as { status: string }).status).toBe("completed");
		expect((entries[0]?.[1] as { result?: string }).result).toBe("All done");
	});

	it("uses fallback when nothing is known yet", () => {
		const entries = resolveSubagentEntries({
			toolCallId: "tool-3",
			activeSubagents: undefined,
			messages: [],
			fallback: { task: "Bootstrapping", agentType: "execute" },
		});

		expect(entries).toHaveLength(1);
		expect((entries[0]?.[1] as { agentType: string }).agentType).toBe(
			"execute",
		);
	});
});
