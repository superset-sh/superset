import { describe, expect, test } from "bun:test";
import {
	buildPromptAgentLaunchRequest,
	buildTaskAgentLaunchRequest,
} from "./agent-launch-request";
import {
	indexResolvedAgentConfigs,
	resolveAgentConfigs,
} from "./agent-settings";

const TASK = {
	id: "task-1",
	slug: "demo-task",
	title: "Demo Task",
	description: null,
	priority: "medium",
	statusName: "Todo",
	labels: ["desktop"],
};

describe("buildPromptAgentLaunchRequest", () => {
	test("returns null for no selection", () => {
		const request = buildPromptAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "new-workspace",
			selectedAgent: "none",
			prompt: "hello",
			configsById: new Map(),
		});

		expect(request).toBeNull();
	});

	test("uses the saved no-prompt command for terminal agents", () => {
		const configsById = indexResolvedAgentConfigs(resolveAgentConfigs({}));
		const request = buildPromptAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "new-workspace",
			selectedAgent: "codex",
			prompt: "",
			configsById,
		});

		expect(request).toMatchObject({
			kind: "terminal",
			agentType: "codex",
			terminal: {
				command:
					'codex -c model_reasoning_effort="high" -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --sandbox workspace-write --ask-for-approval never',
			},
		});
	});

	test("passes files and task slug through for chat agents", () => {
		const configsById = indexResolvedAgentConfigs(resolveAgentConfigs({}));
		const request = buildPromptAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "new-workspace",
			selectedAgent: "superset-chat",
			prompt: "hello",
			initialFiles: [
				{
					data: "data:text/plain;base64,aGVsbG8=",
					mediaType: "text/plain",
					filename: "hello.txt",
				},
			],
			taskSlug: "demo-task",
			configsById,
		});

		expect(request).toMatchObject({
			kind: "chat",
			agentType: "superset-chat",
			chat: {
				initialPrompt: "hello",
				initialFiles: [
					{
						data: "data:text/plain;base64,aGVsbG8=",
						mediaType: "text/plain",
						filename: "hello.txt",
					},
				],
				taskSlug: "demo-task",
			},
		});
	});

	test("builds Amp prompt launches in interactive stdin mode", () => {
		const configsById = indexResolvedAgentConfigs(resolveAgentConfigs({}));
		const request = buildPromptAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "new-workspace",
			selectedAgent: "amp",
			prompt: "wasssup",
			configsById,
		});

		expect(request).toMatchObject({
			kind: "terminal",
			agentType: "amp",
		});
		expect(request?.kind).toBe("terminal");
		if (request?.kind !== "terminal") {
			throw new Error("Expected terminal launch request");
		}
		expect(request.terminal.command).toStartWith("amp <<'SUPERSET_PROMPT_");
		expect(request.terminal.command).not.toContain("amp -x");
	});
});

describe("buildTaskAgentLaunchRequest", () => {
	test("returns null for no selection", () => {
		const request = buildTaskAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "open-in-workspace",
			selectedAgent: "none",
			task: TASK,
			autoRun: false,
			configsById: new Map(),
		});

		expect(request).toBeNull();
	});

	test("uses the chat template configured for superset chat", () => {
		const configsById = indexResolvedAgentConfigs(
			resolveAgentConfigs({
				overrideEnvelope: {
					version: 1,
					presets: [
						{
							id: "superset-chat",
							taskPromptTemplate: "Chat {{title}} / {{slug}}",
						},
					],
				},
			}),
		);
		const request = buildTaskAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "open-in-workspace",
			selectedAgent: "superset-chat",
			task: TASK,
			autoRun: true,
			configsById,
		});

		expect(request).toMatchObject({
			kind: "chat",
			chat: {
				initialPrompt: "Chat Demo Task / demo-task",
				autoExecute: true,
				taskSlug: "demo-task",
			},
		});
	});

	test("builds terminal task launches from resolved config", () => {
		const configsById = indexResolvedAgentConfigs(
			resolveAgentConfigs({
				overrideEnvelope: {
					version: 1,
					presets: [
						{
							id: "codex",
							taskPromptTemplate: "Implement {{slug}}",
						},
					],
				},
			}),
		);
		const request = buildTaskAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "open-in-workspace",
			selectedAgent: "codex",
			task: TASK,
			autoRun: false,
			configsById,
		});

		expect(request).toMatchObject({
			kind: "terminal",
			terminal: {
				taskPromptContent: "Implement demo-task",
				taskPromptFileName: "task-demo-task.md",
				autoExecute: false,
			},
		});
	});

	test("builds Amp task launches in interactive stdin mode", () => {
		const configsById = indexResolvedAgentConfigs(resolveAgentConfigs({}));
		const request = buildTaskAgentLaunchRequest({
			workspaceId: "workspace-1",
			source: "open-in-workspace",
			selectedAgent: "amp",
			task: TASK,
			autoRun: false,
			configsById,
		});

		expect(request).toMatchObject({
			kind: "terminal",
			agentType: "amp",
			terminal: {
				taskPromptFileName: "task-demo-task.md",
				autoExecute: false,
			},
		});
		expect(request?.kind).toBe("terminal");
		if (request?.kind !== "terminal") {
			throw new Error("Expected terminal launch request");
		}
		expect(request.terminal.command).toBe(
			"amp < '.superset/task-demo-task.md'",
		);
	});

	test("rejects disabled agents", () => {
		const configsById = indexResolvedAgentConfigs(
			resolveAgentConfigs({
				overrideEnvelope: {
					version: 1,
					presets: [
						{
							id: "codex",
							enabled: false,
						},
					],
				},
			}),
		);

		expect(() =>
			buildTaskAgentLaunchRequest({
				workspaceId: "workspace-1",
				source: "open-in-workspace",
				selectedAgent: "codex",
				task: TASK,
				autoRun: false,
				configsById,
			}),
		).toThrow('Agent "codex" is disabled');
	});
});
