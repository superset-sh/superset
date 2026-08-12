import { describe, expect, it } from "bun:test";
import {
	type AgentLaunchRequest,
	buildSetupPaneLaunchRequest,
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
			agentType: "superset",
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

	it("keeps reuseExistingPane on terminal requests", () => {
		const normalized = normalizeAgentLaunchRequest({
			kind: "terminal",
			workspaceId: "ws-1",
			terminal: {
				command: "claude",
				paneId: "pane-1",
				reuseExistingPane: true,
			},
		});

		expect(normalized.kind).toBe("terminal");
		if (normalized.kind === "terminal") {
			expect(normalized.terminal.reuseExistingPane).toBe(true);
		}
	});
});

describe("buildSetupPaneLaunchRequest", () => {
	const terminalRequest: AgentLaunchRequest = {
		kind: "terminal",
		workspaceId: "ws-1",
		agentType: "claude",
		source: "workspace-init",
		terminal: {
			command: "claude",
			name: "Agent",
			taskPromptContent: "do the task",
			taskPromptFileName: "task-1.md",
		},
	};

	const splitRequest = (setupPaneId: string): AgentLaunchRequest => ({
		...terminalRequest,
		terminal: { ...terminalRequest.terminal, paneId: setupPaneId },
	});

	it("chains the agent command behind setup commands in the setup pane", () => {
		const launch = buildSetupPaneLaunchRequest({
			request: terminalRequest,
			setupCommands: ["bun install", "bun run db:seed"],
			setupPaneId: "setup-pane",
			waitForSetup: true,
		});

		expect(launch).toEqual({
			chained: true,
			request: {
				...terminalRequest,
				terminal: {
					...terminalRequest.terminal,
					paneId: "setup-pane",
					reuseExistingPane: true,
					command: "bun install && bun run db:seed && claude",
				},
			},
		});
	});

	it("splits a pane off the setup pane when waiting is disabled", () => {
		const launch = buildSetupPaneLaunchRequest({
			request: terminalRequest,
			setupCommands: ["bun install"],
			setupPaneId: "setup-pane",
			waitForSetup: false,
		});

		expect(launch).toEqual({
			chained: false,
			request: splitRequest("setup-pane"),
		});
	});

	it("passes chat requests through unchanged", () => {
		const request: AgentLaunchRequest = {
			kind: "chat",
			workspaceId: "ws-1",
			chat: {},
		};

		expect(
			buildSetupPaneLaunchRequest({
				request,
				setupCommands: ["bun install"],
				setupPaneId: "setup-pane",
				waitForSetup: true,
			}),
		).toEqual({ request, chained: false });
	});

	it("splits instead of chaining when the agent command must not auto-execute", () => {
		const launch = buildSetupPaneLaunchRequest({
			request: {
				...terminalRequest,
				terminal: { ...terminalRequest.terminal, autoExecute: false },
			},
			setupCommands: ["bun install"],
			setupPaneId: "setup-pane",
			waitForSetup: true,
		});

		expect(launch).toEqual({
			chained: false,
			request: {
				...terminalRequest,
				terminal: {
					...terminalRequest.terminal,
					autoExecute: false,
					paneId: "setup-pane",
				},
			},
		});
	});

	it("passes requests that already target a pane through unchanged", () => {
		const request: AgentLaunchRequest = {
			...terminalRequest,
			terminal: { ...terminalRequest.terminal, paneId: "pane-9" },
		};

		expect(
			buildSetupPaneLaunchRequest({
				request,
				setupCommands: ["bun install"],
				setupPaneId: "setup-pane",
				waitForSetup: true,
			}),
		).toEqual({ request, chained: false });
	});

	it("splits instead of chaining without setup commands", () => {
		for (const setupCommands of [null, undefined, []]) {
			expect(
				buildSetupPaneLaunchRequest({
					request: terminalRequest,
					setupCommands,
					setupPaneId: "setup-pane",
					waitForSetup: true,
				}),
			).toEqual({ chained: false, request: splitRequest("setup-pane") });
		}
	});
});
