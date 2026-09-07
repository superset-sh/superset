import { describe, expect, it } from "bun:test";
import { parseClaudeSubagentTranscript } from "./subagent-harnesses/claude";
import { parseCodexRolloutTranscript } from "./subagent-harnesses/codex";

const claudeLines = [
	{
		type: "user",
		uuid: "u1",
		timestamp: "2026-09-06T06:44:17.000Z",
		message: { role: "user", content: "Count the files under packages/i18n" },
	},
	{
		type: "assistant",
		uuid: "a1",
		timestamp: "2026-09-06T06:44:18.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "Use find." },
				{
					type: "tool_use",
					name: "Bash",
					input: { command: "find packages/i18n -type f | wc -l" },
				},
			],
		},
	},
	{
		type: "user",
		uuid: "u2",
		message: {
			role: "user",
			content: [
				{
					type: "tool_result",
					content: [{ type: "text", text: "42\n" }],
				},
			],
		},
	},
	{ type: "attachment", uuid: "x", attachment: {} },
	{
		type: "assistant",
		uuid: "a2",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "42 files." }],
		},
	},
];

describe("parseClaudeSubagentTranscript", () => {
	it("flattens prompt, thinking, tool calls, results, and answer in order", () => {
		const text = claudeLines.map((line) => JSON.stringify(line)).join("\n");
		expect(
			parseClaudeSubagentTranscript(text).map((e) => [
				e.kind,
				e.toolName ?? "",
				e.text,
			]),
		).toEqual([
			["user", "", "Count the files under packages/i18n"],
			["thinking", "", "Use find."],
			["tool_call", "Bash", "find packages/i18n -type f | wc -l"],
			["tool_result", "", "42"],
			["assistant", "", "42 files."],
		]);
	});

	it("skips lines that are not JSON", () => {
		expect(parseClaudeSubagentTranscript("not json\n{}\n")).toEqual([]);
	});
});

describe("parseCodexRolloutTranscript", () => {
	it("reads the agent identity from session_meta and folds response items", () => {
		const lines = [
			{
				type: "session_meta",
				payload: { agent_nickname: "Carver", agent_path: "/root/summarize" },
			},
			{
				type: "response_item",
				timestamp: "2026-09-06T06:39:10.000Z",
				payload: {
					type: "message",
					role: "user",
					id: "m1",
					content: [{ type: "input_text", text: "Read the hook template." }],
				},
			},
			{
				type: "response_item",
				payload: {
					type: "reasoning",
					id: "r1",
					summary: [{ type: "summary_text", text: "Open the file first." }],
				},
			},
			{
				type: "response_item",
				payload: {
					type: "function_call",
					id: "f1",
					name: "shell",
					arguments: JSON.stringify({ command: ["cat", "notify.sh"] }),
				},
			},
			{
				type: "response_item",
				payload: {
					type: "function_call_output",
					id: "o1",
					output: JSON.stringify({ output: "#!/bin/bash\n", metadata: {} }),
				},
			},
			{
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					id: "m2",
					content: [{ type: "output_text", text: "It is a bash hook." }],
				},
			},
			{ type: "event_msg", payload: { type: "token_count" } },
		];
		const parsed = parseCodexRolloutTranscript(
			lines.map((line) => JSON.stringify(line)).join("\n"),
		);
		expect(parsed.description).toBe("Carver · /root/summarize");
		expect(
			parsed.entries.map((e) => [e.kind, e.toolName ?? "", e.text]),
		).toEqual([
			["user", "", "Read the hook template."],
			["thinking", "", "Open the file first."],
			["tool_call", "shell", "cat notify.sh"],
			["tool_result", "", "#!/bin/bash"],
			["assistant", "", "It is a bash hook."],
		]);
	});
});
