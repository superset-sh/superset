import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import {
	indexResolvedAgentConfigs,
	resolveAgentConfigs,
} from "@superset/shared/agent-settings";
import type { ToolContext } from "./types";

let capturedRequest: AgentLaunchRequest | null = null;

const queueMock = mock((input: { request: AgentLaunchRequest }) => {
	capturedRequest = input.request;
	return {
		workspaceId: input.request.workspaceId,
		tabId: null,
		paneId: null,
		sessionId: null,
		status: "queued" as const,
		error: null,
	};
});

const launchMock = mock(async (request: AgentLaunchRequest) => {
	capturedRequest = request;
	return {
		workspaceId: request.workspaceId,
		tabId: "tab-1",
		paneId: "pane-1",
		sessionId: null,
		status: "running" as const,
		error: null,
	};
});

mock.module("renderer/lib/agent-session-orchestrator", () => ({
	queueAgentSessionLaunch: queueMock,
	launchAgentSession: launchMock,
}));

const { startAgentSession } = await import("./start-agent-session");

const OVERRIDE_COMMAND =
	"claude --permission-mode plan --dangerously-skip-permissions";
const BAKED_PROMPT_COMMAND =
	"claude --dangerously-skip-permissions BAKED-PROMPT";
const BAKED_FILE_COMMAND = "claude --dangerously-skip-permissions BAKED-FILE";

function configsById(
	presets: {
		id: string;
		enabled?: boolean;
		command?: string;
		promptCommand?: string;
	}[],
) {
	return indexResolvedAgentConfigs(
		resolveAgentConfigs({
			overrideEnvelope: { version: 1, presets },
		}),
	);
}

function makeContext(
	getResolvedAgentConfigsById?: ToolContext["getResolvedAgentConfigsById"],
): ToolContext {
	return {
		getWorkspaces: () => [
			{ id: "workspace-1", projectId: "project-1", branch: "main" },
		],
		getResolvedAgentConfigsById,
	} as unknown as ToolContext;
}

function promptParams() {
	return {
		workspaceId: "workspace-1",
		command: BAKED_PROMPT_COMMAND,
		name: "Claude",
		agentType: "claude" as const,
		request: {
			kind: "terminal" as const,
			workspaceId: "workspace-1",
			agentType: "claude" as const,
			terminal: {
				command: BAKED_PROMPT_COMMAND,
				name: "Claude",
				prompt: "Fix the failing tests",
			},
		},
	};
}

function taskParams() {
	return {
		workspaceId: "workspace-1",
		command: BAKED_FILE_COMMAND,
		name: "demo-task",
		agentType: "claude" as const,
		request: {
			kind: "terminal" as const,
			workspaceId: "workspace-1",
			agentType: "claude" as const,
			terminal: {
				command: BAKED_FILE_COMMAND,
				name: "demo-task",
				taskPromptContent: "Do the task",
				taskPromptFileName: "task-demo-task.md",
			},
		},
	};
}

describe("start-agent-session device command resolution", () => {
	beforeEach(() => {
		capturedRequest = null;
		queueMock.mockClear();
		launchMock.mockClear();
	});

	it("re-resolves a prompt launch from a claude override", async () => {
		const ctx = makeContext(() =>
			configsById([{ id: "claude", promptCommand: OVERRIDE_COMMAND }]),
		);

		const result = await startAgentSession.execute(promptParams(), ctx);

		expect(result.success).toBe(true);
		const command =
			capturedRequest?.kind === "terminal"
				? capturedRequest.terminal.command
				: undefined;
		expect(command).toContain("--permission-mode plan");
		expect(command).toContain("Fix the failing tests");
		expect(command).not.toBe(BAKED_PROMPT_COMMAND);
	});

	it("re-resolves a task launch into the overridden file command", async () => {
		const ctx = makeContext(() =>
			configsById([{ id: "claude", promptCommand: OVERRIDE_COMMAND }]),
		);

		await startAgentSession.execute(taskParams(), ctx);

		const command =
			capturedRequest?.kind === "terminal"
				? capturedRequest.terminal.command
				: undefined;
		expect(command).toContain("--permission-mode plan");
		expect(command).toContain(".superset/task-demo-task.md");
		expect(command).not.toBe(BAKED_FILE_COMMAND);
	});

	it("preserves server-authoritative fields when re-resolving", async () => {
		const ctx = makeContext(() =>
			configsById([{ id: "claude", promptCommand: OVERRIDE_COMMAND }]),
		);

		await startAgentSession.execute(taskParams(), ctx);

		expect(capturedRequest?.kind).toBe("terminal");
		if (capturedRequest?.kind === "terminal") {
			expect(capturedRequest.terminal.name).toBe("demo-task");
			expect(capturedRequest.terminal.taskPromptContent).toBe("Do the task");
			expect(capturedRequest.terminal.taskPromptFileName).toBe(
				"task-demo-task.md",
			);
		}
	});

	it("keeps the baked command when the config is disabled", async () => {
		const ctx = makeContext(() =>
			configsById([{ id: "claude", enabled: false }]),
		);

		await startAgentSession.execute(promptParams(), ctx);

		const command =
			capturedRequest?.kind === "terminal"
				? capturedRequest.terminal.command
				: undefined;
		expect(command).toBe(BAKED_PROMPT_COMMAND);
	});

	it("keeps the baked command when no config matches the agent", async () => {
		const ctx = makeContext(() => new Map());

		await startAgentSession.execute(promptParams(), ctx);

		const command =
			capturedRequest?.kind === "terminal"
				? capturedRequest.terminal.command
				: undefined;
		expect(command).toBe(BAKED_PROMPT_COMMAND);
	});

	it("keeps the baked command for an old-server request lacking prompt fields", async () => {
		const ctx = makeContext(() =>
			configsById([{ id: "claude", promptCommand: OVERRIDE_COMMAND }]),
		);

		await startAgentSession.execute(
			{
				workspaceId: "workspace-1",
				command: BAKED_PROMPT_COMMAND,
				name: "Claude",
				request: {
					kind: "terminal" as const,
					workspaceId: "workspace-1",
					terminal: { command: BAKED_PROMPT_COMMAND, name: "Claude" },
				},
			},
			ctx,
		);

		const command =
			capturedRequest?.kind === "terminal"
				? capturedRequest.terminal.command
				: undefined;
		expect(command).toBe(BAKED_PROMPT_COMMAND);
	});

	it("keeps the baked command when the resolver getter is absent", async () => {
		const ctx = makeContext(undefined);

		await startAgentSession.execute(promptParams(), ctx);

		const command =
			capturedRequest?.kind === "terminal"
				? capturedRequest.terminal.command
				: undefined;
		expect(command).toBe(BAKED_PROMPT_COMMAND);
	});

	it("never touches a chat/superset launch", async () => {
		const ctx = makeContext(() =>
			configsById([{ id: "claude", promptCommand: OVERRIDE_COMMAND }]),
		);

		await startAgentSession.execute(
			{
				workspaceId: "workspace-1",
				openChatPane: true,
				agentType: "superset" as const,
				chatLaunchConfig: { initialPrompt: "Chat prompt" },
				request: {
					kind: "chat" as const,
					workspaceId: "workspace-1",
					agentType: "superset" as const,
					chat: { initialPrompt: "Chat prompt" },
				},
			},
			ctx,
		);

		expect(capturedRequest?.kind).toBe("chat");
	});
});
