import { describe, expect, it } from "bun:test";
import { buildAgentToolDisplayModel } from "../buildAgentToolDisplayModel";
import { buildAgentTimelineDisplayModel } from "./buildAgentTimelineDisplayModel";

describe("buildAgentTimelineDisplayModel", () => {
	it("routes tool progress through the inline tool display path", () => {
		const display = buildAgentTimelineDisplayModel({
			type: "tool_progress",
			id: "tool-progress-1",
			toolCallId: "toolu_1",
			toolName: "Bash",
			status: "running",
			summary: "pwd",
		});

		expect(display.type).toBe("inline_tool");
		if (display.type !== "inline_tool") {
			throw new Error("Expected tool_progress to produce an inline tool.");
		}
		const model = buildAgentToolDisplayModel(display.toolPart);
		expect(model.kind).toBe("shell");
		expect(model.title).toBe("Shell");
		expect(model.summary).toBe("pwd");
	});

	it("routes historical local_bash subagent events through the inline tool display path", () => {
		const display = buildAgentTimelineDisplayModel({
			type: "subagent_event",
			id: "subagent-local-bash",
			taskId: "local-bash",
			status: "completed",
			subagentType: "local_bash",
			description: "Calculate large home directory sizes",
		});

		expect(display.type).toBe("inline_tool");
		if (display.type !== "inline_tool") {
			throw new Error("Expected local_bash to produce an inline tool.");
		}
		const model = buildAgentToolDisplayModel(display.toolPart);
		expect(model.kind).toBe("shell");
		expect(model.status).toBe("done");
		expect(model.summary).toBe("Calculate large home directory sizes");
	});

	it("keeps real subagent lifecycle events on the native timeline path", () => {
		const display = buildAgentTimelineDisplayModel({
			type: "subagent_event",
			id: "subagent-general",
			taskId: "general",
			status: "progress",
			subagentType: "general-purpose",
			lastToolName: "Bash",
			description: "Inspect the repository",
		});

		expect(display).toMatchObject({
			type: "native_timeline",
		});
	});
});
