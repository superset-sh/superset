import { describe, expect, it } from "bun:test";
import {
	type AgentLaunchRequest,
	normalizeAgentLaunchRequest,
} from "./agent-launch";

describe("normalizeAgentLaunchRequest", () => {
	it("returns canonical request unchanged", () => {
		const request: AgentLaunchRequest = {
			kind: "terminal",
			workspaceId: "ws-1",
			source: "mcp",
			idempotencyKey: "idem-1",
			terminal: {
				command: "claude --dangerously-skip-permissions",
				name: "task-123",
			},
		};

		const normalized = normalizeAgentLaunchRequest(request);
		expect(normalized).toEqual(request);
	});

	it("maps legacy terminal launch params", () => {
		const normalized = normalizeAgentLaunchRequest({
			workspaceId: "ws-1",
			command: "codex --yolo",
			name: "task-123",
			paneId: "pane-1",
			agentType: "codex",
			source: "command-watcher",
		});

		expect(normalized).toEqual({
			kind: "terminal",
			workspaceId: "ws-1",
			agentType: "codex",
			source: "command-watcher",
			terminal: {
				command: "codex --yolo",
				name: "task-123",
				paneId: "pane-1",
			},
		});
	});

	it("maps legacy chat launch params", () => {
		const normalized = normalizeAgentLaunchRequest({
			workspaceId: "ws-1",
			openChatPane: true,
			paneId: "pane-1",
			chatLaunchConfig: {
				initialPrompt: "summarize this task",
				model: "anthropic/claude-sonnet-4",
				retryCount: 3,
			},
		});

		expect(normalized).toEqual({
			kind: "chat",
			workspaceId: "ws-1",
			agentType: "superset-chat",
			chat: {
				paneId: "pane-1",
				initialPrompt: "summarize this task",
				model: "anthropic/claude-sonnet-4",
				retryCount: 3,
			},
		});
	});

	it("throws when legacy request has no launch payload", () => {
		expect(() =>
			normalizeAgentLaunchRequest({
				workspaceId: "ws-1",
			}),
		).toThrow("missing terminal command or chat launch config");
	});
});
