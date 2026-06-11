import { describe, expect, it } from "bun:test";
import { normalizeToolName } from "./tool-helpers";

describe("normalizeToolName", () => {
	it("normalizes Mastra built-in tool names to supported render targets", () => {
		expect(normalizeToolName("view")).toBe("mastra_workspace_read_file");
		expect(normalizeToolName("search_content")).toBe("mastra_workspace_search");
		expect(normalizeToolName("find_files")).toBe("mastra_workspace_list_files");
		expect(normalizeToolName("write_file")).toBe("mastra_workspace_write_file");
		expect(normalizeToolName("string_replace_lsp")).toBe(
			"mastra_workspace_edit_file",
		);
		expect(normalizeToolName("execute_command")).toBe(
			"mastra_workspace_execute_command",
		);
		expect(normalizeToolName("web_search")).toBe("web_search");
		expect(normalizeToolName("web_extract")).toBe("web_fetch");
		expect(normalizeToolName("ask_user")).toBe("ask_user_question");
		expect(normalizeToolName("ast_smart_edit")).toBe("ast_smart_edit");
		expect(normalizeToolName("request_sandbox_access")).toBe("request_access");
		expect(normalizeToolName("task_write")).toBe("task_write");
		expect(normalizeToolName("task_check")).toBe("task_check");
		expect(normalizeToolName("submit_plan")).toBe("submit_plan");
	});

	it("preserves unknown names", () => {
		expect(normalizeToolName("some_future_tool")).toBe("some_future_tool");
	});

	it("normalizes Claude Code native tool names to supported render targets", () => {
		expect(normalizeToolName("Bash")).toBe("mastra_workspace_execute_command");
		expect(normalizeToolName("Read")).toBe("mastra_workspace_read_file");
		expect(normalizeToolName("Write")).toBe("mastra_workspace_write_file");
		expect(normalizeToolName("Edit")).toBe("mastra_workspace_edit_file");
		expect(normalizeToolName("MultiEdit")).toBe("mastra_workspace_edit_file");
		expect(normalizeToolName("Grep")).toBe("mastra_workspace_search");
		expect(normalizeToolName("Glob")).toBe("mastra_workspace_list_files");
		expect(normalizeToolName("WebFetch")).toBe("web_fetch");
		expect(normalizeToolName("WebSearch")).toBe("web_search");
		expect(normalizeToolName("Task")).toBe("subagent");
		expect(normalizeToolName("Skill")).toBe("skill");
	});
});
