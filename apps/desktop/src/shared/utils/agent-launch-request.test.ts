import { describe, expect, test } from "bun:test";
import {
	buildPromptAgentLaunchRequest,
	buildTaskAgentLaunchRequest,
} from "./agent-launch-request";
import { getDefaultAgentPreset } from "./agent-preset-settings";

describe("buildPromptAgentLaunchRequest", () => {
	test("returns null when no agent is selected", () => {
		const request = buildPromptAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "new-workspace",
			selectedAgent: "none",
			prompt: "do something",
			agentPresetById: new Map(),
		});

		expect(request).toBeNull();
	});

	test("falls back to the saved command when prompt is empty", () => {
		const request = buildPromptAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "new-workspace",
			selectedAgent: "codex",
			prompt: "",
			agentPresetById: new Map(),
		});

		expect(request).toMatchObject({
			kind: "terminal",
			workspaceId: "workspace-1",
			agentType: "codex",
			source: "new-workspace",
			terminal: {
				command:
					'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
				name: "Agent",
			},
		});
	});
});

describe("buildTaskAgentLaunchRequest", () => {
	test("uses the claude task template for superset chat", () => {
		const claudePreset = {
			...getDefaultAgentPreset("claude"),
			taskPromptTemplate: "Task {{title}} / {{slug}}",
		};
		const request = buildTaskAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "open-in-workspace",
			selectedAgent: "superset-chat",
			task: {
				id: "task-1",
				slug: "demo-task",
				title: "Demo Task",
				description: null,
				priority: "medium",
				statusName: "Todo",
				labels: ["desktop"],
			},
			autoRun: true,
			agentPresetById: new Map([["claude", claudePreset]]),
		});

		expect(request).toMatchObject({
			kind: "chat",
			chat: {
				initialPrompt: "Task Demo Task / demo-task",
				autoExecute: true,
				taskSlug: "demo-task",
			},
		});
	});

	test("builds terminal requests from the selected preset", () => {
		const codexPreset = {
			...getDefaultAgentPreset("codex"),
			taskPromptTemplate: "Implement {{slug}}",
		};
		const request = buildTaskAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "open-in-workspace",
			selectedAgent: "codex",
			task: {
				id: "task-1",
				slug: "demo-task",
				title: "Demo Task",
				description: null,
				priority: "medium",
				statusName: "Todo",
				labels: null,
			},
			autoRun: false,
			agentPresetById: new Map([["codex", codexPreset]]),
		});

		expect(request).toMatchObject({
			kind: "terminal",
			terminal: {
				taskPromptContent: "Implement demo-task",
				taskPromptFileName: "task-demo-task.md",
				autoExecute: false,
			},
		});

		if (request.kind !== "terminal") {
			throw new Error("Expected terminal request");
		}

		expect(request.terminal.command).toContain(
			"model_supports_reasoning_summaries=true -- \"$(cat '.superset/task-demo-task.md')\"",
		);
	});
});
