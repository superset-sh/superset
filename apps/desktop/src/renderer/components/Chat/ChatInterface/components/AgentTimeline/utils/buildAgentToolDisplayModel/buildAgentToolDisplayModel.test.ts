import { describe, expect, it } from "bun:test";
import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { buildAgentToolDisplayModel } from "./buildAgentToolDisplayModel";

function toolPart(part: ToolPart): ToolPart {
	return part;
}

describe("buildAgentToolDisplayModel", () => {
	it("normalizes Claude Bash into a shell display model", () => {
		const model = buildAgentToolDisplayModel(
			toolPart({
				type: "tool-Bash",
				toolCallId: "toolu_1",
				state: "output-available",
				input: { command: "pwd" },
				output: { stdout: "/tmp\n", exitCode: 0 },
			} as ToolPart),
		);

		expect(model.kind).toBe("shell");
		expect(model.title).toBe("Shell");
		expect(model.status).toBe("done");
		expect(model.summary).toBe("pwd");
		expect(model.details).toContainEqual({ label: "Command", value: "pwd" });
	});

	it("normalizes local_bash into a compact shell display model", () => {
		const model = buildAgentToolDisplayModel(
			toolPart({
				type: "tool-local_bash",
				toolCallId: "toolu_local_1",
				state: "output-error",
				input: { command: "du -sh ~/Documents" },
				errorText: "permission denied",
			} as unknown as ToolPart),
		);

		expect(model.kind).toBe("shell");
		expect(model.title).toBe("Shell");
		expect(model.status).toBe("error");
		expect(model.summary).toBe("du -sh ~/Documents");
		expect(model.error).toBe("permission denied");
		expect(model.details).toContainEqual({
			label: "Command",
			value: "du -sh ~/Documents",
		});
	});

	it("normalizes Claude Edit into an edit display model", () => {
		const model = buildAgentToolDisplayModel(
			toolPart({
				type: "tool-Edit",
				toolCallId: "toolu_2",
				state: "input-available",
				input: {
					file_path: "src/app.ts",
					old_string: "old",
					new_string: "new",
				},
			} as ToolPart),
		);

		expect(model.kind).toBe("edit");
		expect(model.title).toBe("Edit");
		expect(model.summary).toBe("src/app.ts");
	});

	it("normalizes Claude Task into a subagent display model", () => {
		const model = buildAgentToolDisplayModel(
			toolPart({
				type: "tool-Task",
				toolCallId: "toolu_3",
				state: "input-streaming",
				input: {
					subagent_type: "general-purpose",
					prompt: "Inspect memory usage",
				},
			} as ToolPart),
		);

		expect(model.kind).toBe("subagent");
		expect(model.status).toBe("running");
		expect(model.summary).toBe("Inspect memory usage");
	});
});
