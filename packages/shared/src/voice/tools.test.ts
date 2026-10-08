import { describe, expect, test } from "bun:test";
import {
	isVoiceToolName,
	realtimeToolDefinitions,
	VOICE_TOOLS,
	voiceTool,
} from "./tools";

describe("realtimeToolDefinitions", () => {
	test("emits one function tool per definition with plain JSON schema", () => {
		const tools = realtimeToolDefinitions();
		expect(tools.map((tool) => tool.name)).toEqual(
			VOICE_TOOLS.map((tool) => tool.name),
		);
		for (const tool of tools) {
			expect(tool.type).toBe("function");
			expect(tool.parameters).not.toHaveProperty("$schema");
			expect(tool.parameters.type).toBe("object");
		}
	});

	test("defaults survive the schema so the model sees them", () => {
		const list = realtimeToolDefinitions().find(
			(tool) => tool.name === "list_workspaces",
		);
		const properties = list?.parameters.properties as Record<
			string,
			{ default?: unknown }
		>;
		expect(properties.filter?.default).toBe("active");
		expect(properties.limit?.default).toBe(10);
	});
});

describe("voiceTool", () => {
	test("parses arguments with defaults applied", () => {
		const parsed = voiceTool("read_session").parameters.parse({
			workspace: "auth",
		});
		expect(parsed).toEqual({ workspace: "auth", maxChars: 1500 });
	});

	test("names are checkable at the boundary", () => {
		expect(isVoiceToolName("show")).toBe(true);
		expect(isVoiceToolName("delete_workspace")).toBe(false);
	});
});
