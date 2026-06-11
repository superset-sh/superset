import { describe, expect, it } from "bun:test";
import {
	classifyAgentToolName,
	isKnownAgentDisplayToolName,
	normalizeAgentToolName,
} from "./agent-tool-normalization";

describe("agent tool normalization", () => {
	it("normalizes Claude and ACP shell aliases into one canonical shell tool", () => {
		for (const name of [
			"Bash",
			"bash",
			"execute_command",
			"run_command",
			"run_terminal_cmd",
			"local_bash",
			"local_shell",
			"local_command",
		]) {
			expect(normalizeAgentToolName(name)).toBe(
				"mastra_workspace_execute_command",
			);
			expect(classifyAgentToolName(name)).toMatchObject({
				kind: "shell",
				displayName: "Shell",
				isKnownDisplayTool: true,
			});
		}
	});

	it("classifies canonical tool display categories", () => {
		expect(classifyAgentToolName("Read").kind).toBe("read");
		expect(classifyAgentToolName("Write").kind).toBe("write");
		expect(classifyAgentToolName("MultiEdit").kind).toBe("edit");
		expect(classifyAgentToolName("Grep").kind).toBe("search");
		expect(classifyAgentToolName("WebFetch").kind).toBe("fetch");
		expect(classifyAgentToolName("Task").kind).toBe("subagent");
		expect(classifyAgentToolName("Skill").kind).toBe("skill");
	});

	it("keeps specialized Superset tools out of the generic display model", () => {
		expect(normalizeAgentToolName("task_write")).toBe("task_write");
		expect(isKnownAgentDisplayToolName("task_write")).toBe(false);
		expect(classifyAgentToolName("some_future_tool")).toMatchObject({
			canonicalName: "some_future_tool",
			kind: "unknown",
			isKnownDisplayTool: false,
		});
	});
});
