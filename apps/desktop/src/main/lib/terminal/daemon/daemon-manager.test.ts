import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import {
	TERMINAL_ATTACH_CANCELED_MESSAGE,
	TerminalAttachCanceledError,
} from "../errors";
import type { SessionInfo } from "./types";

let mockAppStateData: unknown = null;
let mockHistoryMetadata: {
	cwd: string;
	cols?: number;
	rows?: number;
	endedAt?: number;
} | null = null;
let mockHistoryScrollback: string | null = null;
let mockResolveAgentResumeTarget: (params: unknown) => Promise<unknown> =
	async (_params: unknown) => null;
let mockGetSessionLocation: () => Promise<unknown> = async () => null;
const mockUpsertSessionLocationCalls: Array<unknown> = [];
const mockUpdateSessionLocationAgentIdentityCalls: Array<unknown> = [];
const mockMarkSessionLocationExitedCalls: Array<unknown> = [];

function inferMockSupportedAgentIdFromLaunchCommand(
	command: string | null | undefined,
) {
	if (!command) return null;
	const afterLeadingCd = command.replace(/^cd\s+.+?\s+&&\s+/, "");
	const withoutEnv = afterLeadingCd.replace(
		/^([A-Za-z_][A-Za-z0-9_]*=\S+\s+)*/,
		"",
	);
	const firstToken = withoutEnv.trim().split(/\s+/, 1)[0];
	const executableName = firstToken?.split("/").pop()?.toLowerCase();
	return executableName === "claude" || executableName === "codex"
		? executableName
		: null;
}

class MockTerminalHostClient extends EventEmitter {
	createOrAttachCalls: Array<{ sessionId: string; requestId?: string }> = [];
	cancelCreateOrAttachCalls: Array<{ sessionId: string; requestId: string }> =
		[];
	killCalls: Array<{ sessionId: string; deleteHistory?: boolean }> = [];
	killAllCalls = 0;
	killError: Error | null = null;
	killAllError: Error | null = null;
	listSessionsIfRunningResult: { sessions: Array<unknown> } | null = {
		sessions: [],
	};
	listSessionsIfRunningError: Error | null = null;

	private pendingCreateOrAttach = new Map<
		string,
		{
			resolve: (value: {
				isNew: boolean;
				snapshot: {
					snapshotAnsi: string;
					rehydrateSequences: string;
					cwd: string | null;
					modes: Record<string, boolean>;
					cols: number;
					rows: number;
					scrollbackLines: number;
				};
				wasRecovered: boolean;
				pid: number | null;
			}) => void;
			reject: (error: Error) => void;
		}
	>();

	private createOrAttachGate: {
		promise: Promise<void>;
		release: () => void;
	} | null = null;

	blockCreateOrAttach() {
		if (this.createOrAttachGate) {
			throw new Error("createOrAttach is already blocked");
		}

		let release!: () => void;
		const promise = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.createOrAttachGate = { promise, release };
	}

	releaseCreateOrAttach() {
		this.createOrAttachGate?.release();
		this.createOrAttachGate = null;
	}

	async kill(params: { sessionId: string; deleteHistory?: boolean }) {
		this.killCalls.push(params);
		if (this.killError) {
			throw this.killError;
		}
	}

	async killAll(_params?: object) {
		this.killAllCalls++;
		if (this.killAllError) {
			throw this.killAllError;
		}
	}

	async createOrAttach(
		params: { sessionId: string; requestId?: string },
		signal?: AbortSignal,
	) {
		if (this.createOrAttachGate) {
			await this.createOrAttachGate.promise;
		}
		if (signal?.aborted) {
			throw new TerminalAttachCanceledError();
		}

		this.createOrAttachCalls.push(params);
		return new Promise<{
			isNew: boolean;
			snapshot: {
				snapshotAnsi: string;
				rehydrateSequences: string;
				cwd: string | null;
				modes: Record<string, boolean>;
				cols: number;
				rows: number;
				scrollbackLines: number;
			};
			wasRecovered: boolean;
			pid: number | null;
		}>((resolve, reject) => {
			this.pendingCreateOrAttach.set(params.requestId ?? params.sessionId, {
				resolve,
				reject,
			});
		});
	}

	async cancelCreateOrAttach(params: { sessionId: string; requestId: string }) {
		this.cancelCreateOrAttachCalls.push(params);
		const pending = this.pendingCreateOrAttach.get(params.requestId);
		if (pending) {
			this.pendingCreateOrAttach.delete(params.requestId);
			pending.reject(new Error(TERMINAL_ATTACH_CANCELED_MESSAGE));
		}
		return { success: true as const };
	}

	resolveCreateOrAttach(requestId: string, pid = 123) {
		const pending = this.pendingCreateOrAttach.get(requestId);
		if (!pending) {
			throw new Error(`No pending createOrAttach for ${requestId}`);
		}

		this.pendingCreateOrAttach.delete(requestId);
		pending.resolve({
			isNew: true,
			wasRecovered: false,
			pid,
			snapshot: {
				snapshotAnsi: "",
				rehydrateSequences: "",
				cwd: "/tmp",
				modes: {},
				cols: 80,
				rows: 24,
				scrollbackLines: 0,
			},
		});
	}

	async listSessions() {
		return { sessions: [] };
	}

	async listSessionsIfRunning() {
		if (this.listSessionsIfRunningError) {
			throw this.listSessionsIfRunningError;
		}
		return this.listSessionsIfRunningResult;
	}

	writeNoAck() {}

	resize() {
		return Promise.resolve();
	}

	signal() {
		return Promise.resolve();
	}

	detach() {
		return Promise.resolve();
	}

	clearScrollback() {
		return Promise.resolve();
	}
}

let mockClient = new MockTerminalHostClient();

mock.module("../../terminal-host/client", () => ({
	getTerminalHostClient: () => mockClient,
	disposeTerminalHostClient: () => {},
}));

mock.module("main/lib/analytics", () => ({
	track: () => {},
}));

mock.module("../env", () => ({
	buildTerminalEnv: () => ({}),
	getDefaultShell: () => "/bin/zsh",
}));

mock.module("main/lib/app-state", () => ({
	appState: {
		get data() {
			return mockAppStateData;
		},
	},
}));

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				all: () => [],
				get: () => undefined,
			}),
		}),
	},
}));

mock.module("@superset/local-db", () => ({
	workspaces: { id: "id" },
}));

mock.module("../../terminal-history", () => ({
	HistoryReader: class {
		async readMetadata() {
			return mockHistoryMetadata;
		}

		async readScrollback() {
			return mockHistoryScrollback;
		}

		async cleanup() {
			return Promise.resolve();
		}
	},
	truncateUtf8ToLastBytes: (value: string) => value,
}));

mock.module("../port-manager", () => ({
	portManager: {
		upsertSession: () => {},
		unregisterSession: () => {},
		checkOutputForHint: () => {},
	},
}));

mock.module("../agent-resume", () => ({
	inferSupportedAgentIdFromLaunchCommand:
		inferMockSupportedAgentIdFromLaunchCommand,
	resolveAgentResumeTarget: (params: unknown) =>
		mockResolveAgentResumeTarget(params),
}));

mock.module("../session-location-log", () => ({
	SESSION_LOCATION_LOG_PATH: "/tmp/session-locations.json",
	buildSessionLocationKey: ({
		workspaceId,
		tabId,
		paneId,
	}: {
		workspaceId: string;
		tabId: string;
		paneId: string;
	}) => `${workspaceId}:${tabId}:${paneId}`,
	getSessionLocation: () => mockGetSessionLocation(),
	markSessionLocationExited: (params: unknown) => {
		mockMarkSessionLocationExitedCalls.push(params);
	},
	updateSessionLocationAgentIdentity: (params: unknown) => {
		mockUpdateSessionLocationAgentIdentityCalls.push(params);
	},
	upsertSessionLocation: (params: unknown) => {
		mockUpsertSessionLocationCalls.push(params);
	},
}));

mock.module("./history-manager", () => ({
	HistoryManager: class {
		cleanupHistory() {
			return Promise.resolve();
		}

		cleanup() {
			return Promise.resolve();
		}

		forceCloseAll() {
			return Promise.resolve();
		}

		initHistoryWriter() {
			return Promise.resolve();
		}

		writeToHistory() {}

		closeHistoryWriter() {}

		closeAllSync() {}

		reset() {
			return Promise.resolve();
		}
	},
}));

const { DaemonTerminalManager } = await import("./daemon-manager");

describe("DaemonTerminalManager kill tracking", () => {
	beforeEach(() => {
		mockClient = new MockTerminalHostClient();
		mockAppStateData = null;
		mockHistoryMetadata = null;
		mockHistoryScrollback = null;
		mockResolveAgentResumeTarget = async () => null;
		mockGetSessionLocation = async () => null;
		mockUpsertSessionLocationCalls.length = 0;
		mockUpdateSessionLocationAgentIdentityCalls.length = 0;
		mockMarkSessionLocationExitedCalls.length = 0;
	});

	afterAll(() => {
		mock.restore();
	});

	it("waits for daemon exit and labels killed sessions", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-kill-1";
		const sessions = (
			manager as unknown as { sessions: Map<string, SessionInfo> }
		).sessions;
		sessions.set(paneId, {
			paneId,
			workspaceId: "ws-1",
			isAlive: true,
			lastActive: Date.now(),
			cwd: "",
			pid: 123,
			cols: 80,
			rows: 24,
		});

		let exitReason: string | undefined;
		manager.on(`exit:${paneId}`, (_exitCode, _signal, reason) => {
			exitReason = reason;
		});

		await manager.kill({ paneId });
		expect(exitReason).toBeUndefined();

		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("killed");
		expect(mockClient.killCalls.length).toBe(1);
	});

	it("labels exit as killed even if session is missing", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-kill-2";

		let exitReason: string | undefined;
		manager.on(`exit:${paneId}`, (_exitCode, _signal, reason) => {
			exitReason = reason;
		});

		await manager.kill({ paneId });
		expect(mockMarkSessionLocationExitedCalls).toContainEqual({
			paneId,
			exitReason: "killed",
		});
		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("killed");
	});

	it("marks the session location exited when the daemon reports a missing session", () => {
		void new DaemonTerminalManager();

		mockClient.emit(
			"terminalError",
			"pane-missing",
			"Session not found",
			"ENOENT",
		);

		expect(mockMarkSessionLocationExitedCalls).toContainEqual({
			paneId: "pane-missing",
			exitReason: "error",
		});
	});

	it("marks every workspace session exited after killByWorkspaceId tears them down", async () => {
		const manager = new DaemonTerminalManager();
		mockClient.listSessionsIfRunningResult = {
			sessions: [
				{
					sessionId: "pane-1",
					paneId: "pane-1",
					workspaceId: "ws-1",
					isAlive: true,
				},
				{
					sessionId: "pane-2",
					paneId: "pane-2",
					workspaceId: "ws-1",
					isAlive: true,
				},
			],
		};

		await manager.killByWorkspaceId("ws-1");

		expect(mockMarkSessionLocationExitedCalls).toEqual([
			{ paneId: "pane-1", exitReason: "killed" },
			{ paneId: "pane-2", exitReason: "killed" },
		]);
	});

	it("marks probed daemon sessions exited after forceKillAll succeeds", async () => {
		const manager = new DaemonTerminalManager();
		mockClient.listSessionsIfRunningResult = {
			sessions: [
				{
					sessionId: "pane-1",
					paneId: "pane-1",
					workspaceId: "ws-1",
					isAlive: true,
				},
			],
		};

		await manager.forceKillAll();

		expect(mockMarkSessionLocationExitedCalls).toEqual([
			{ paneId: "pane-1", exitReason: "killed" },
		]);
	});

	it("does not mark sessions exited when killByWorkspaceId fails", async () => {
		const manager = new DaemonTerminalManager();
		mockClient.listSessionsIfRunningResult = {
			sessions: [
				{
					sessionId: "pane-1",
					paneId: "pane-1",
					workspaceId: "ws-1",
					isAlive: true,
				},
			],
		};
		mockClient.killError = new Error("daemon unavailable");

		await expect(manager.killByWorkspaceId("ws-1")).resolves.toEqual({
			killed: 0,
			failed: 1,
		});
		expect(mockMarkSessionLocationExitedCalls).toEqual([]);
	});

	it("does not mark sessions exited when forceKillAll fails", async () => {
		const manager = new DaemonTerminalManager();
		mockClient.listSessionsIfRunningResult = {
			sessions: [
				{
					sessionId: "pane-1",
					paneId: "pane-1",
					workspaceId: "ws-1",
					isAlive: true,
				},
			],
		};
		mockClient.killAllError = new Error("killAll failed");

		await expect(manager.forceKillAll()).rejects.toThrow("killAll failed");
		expect(mockMarkSessionLocationExitedCalls).toEqual([]);
	});

	it("defaults exit reason to exited when no kill tombstone exists", () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-exit-1";

		let exitReason: string | undefined;
		manager.on(`exit:${paneId}`, (_exitCode, _signal, reason) => {
			exitReason = reason;
		});

		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("exited");
	});

	it("infers codex from the persisted command during cold restore when session identity is missing", async () => {
		mockHistoryMetadata = {
			cwd: "/repo",
			cols: 120,
			rows: 32,
		};
		mockHistoryScrollback = "restored scrollback";
		mockGetSessionLocation = async () => ({
			paneId: "pane-codex",
			tabId: "tab-codex",
			workspaceId: "ws-1",
			cwd: "/repo",
			pid: null,
			status: "exited",
			createdAt: 0,
			updatedAt: 0,
			locationKey: "ws-1:tab-codex:pane-codex",
			workspacePath: "/repo",
			rootPath: "/root",
			command: "/usr/local/bin/codex --model gpt-5.4",
		});

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "session-123",
				resumeCommand: "codex resume session-123",
				sourcePath: "transcript",
			};
		};

		const manager = new DaemonTerminalManager();
		const result = await manager.createOrAttach({
			paneId: "pane-codex",
			tabId: "tab-codex",
			workspaceId: "ws-1",
		});

		expect(resolveCalls).toHaveLength(1);
		expect(resolveCalls[0]?.agentId).toBe("codex");
		expect(resolveCalls[0]?.sessionId).toBeUndefined();
		expect(resolveCalls[0]?.originalCommand).toBe(
			"/usr/local/bin/codex --model gpt-5.4",
		);
		expect(result).toMatchObject({
			isColdRestore: true,
			previousCwd: "/repo",
			resumeCommand: "codex resume session-123",
		});
		expect(mockUpdateSessionLocationAgentIdentityCalls).toEqual([
			{
				paneId: "pane-codex",
				agentId: "codex",
				agentSessionId: "session-123",
			},
		]);
		expect(mockUpsertSessionLocationCalls).toContainEqual({
			paneId: "pane-codex",
			tabId: "tab-codex",
			workspaceId: "ws-1",
			workspaceName: undefined,
			workspacePath: undefined,
			rootPath: undefined,
			cwd: "/repo",
			command: "/usr/local/bin/codex --model gpt-5.4",
			pid: null,
		});
	});

	it("uses the Superset preset command when an existing agent row has no command", async () => {
		mockHistoryMetadata = {
			cwd: "/repo",
			cols: 120,
			rows: 32,
		};
		mockHistoryScrollback = "restored scrollback";
		mockGetSessionLocation = async () => ({
			paneId: "pane-codex-empty-command",
			tabId: "tab-codex-empty-command",
			workspaceId: "ws-1",
			cwd: "/repo",
			pid: null,
			status: "exited",
			createdAt: 0,
			updatedAt: 0,
			locationKey: "ws-1:tab-codex-empty-command:pane-codex-empty-command",
			workspacePath: "/repo",
			rootPath: "/root",
			agentId: "codex",
			agentSessionId: "session-legacy",
		});

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "session-legacy",
				resumeCommand:
					"codex --dangerously-bypass-approvals-and-sandbox resume session-legacy",
				sourcePath: "session-location-log",
			};
		};

		const manager = new DaemonTerminalManager();
		const result = await manager.createOrAttach({
			paneId: "pane-codex-empty-command",
			tabId: "tab-codex-empty-command",
			workspaceId: "ws-1",
		});

		expect(resolveCalls).toHaveLength(1);
		expect(resolveCalls[0]?.agentId).toBe("codex");
		expect(resolveCalls[0]?.sessionId).toBe("session-legacy");
		expect(resolveCalls[0]?.originalCommand).toBe(
			"codex --dangerously-bypass-approvals-and-sandbox",
		);
		expect(result).toMatchObject({
			isColdRestore: true,
			previousCwd: "/repo",
			resumeCommand:
				"codex --dangerously-bypass-approvals-and-sandbox resume session-legacy",
		});
		expect(mockUpsertSessionLocationCalls).toContainEqual({
			paneId: "pane-codex-empty-command",
			tabId: "tab-codex-empty-command",
			workspaceId: "ws-1",
			workspaceName: undefined,
			workspacePath: undefined,
			rootPath: undefined,
			cwd: "/repo",
			command: "codex --dangerously-bypass-approvals-and-sandbox",
			pid: null,
		});
	});

	it("infers codex from the current pane command when the session row is missing", async () => {
		mockHistoryMetadata = {
			cwd: "/repo",
			cols: 120,
			rows: 32,
		};
		mockHistoryScrollback = "restored scrollback";
		mockGetSessionLocation = async () => null;

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "session-456",
				resumeCommand: "codex resume session-456",
				sourcePath: "transcript",
			};
		};

		const manager = new DaemonTerminalManager();
		const result = await manager.createOrAttach({
			paneId: "pane-codex-missing",
			tabId: "tab-codex-missing",
			workspaceId: "ws-1",
			command: "codex --dangerously-bypass-approvals-and-sandbox",
		});

		expect(resolveCalls).toHaveLength(1);
		expect(resolveCalls[0]?.agentId).toBe("codex");
		expect(resolveCalls[0]?.originalCommand).toBe(
			"codex --dangerously-bypass-approvals-and-sandbox",
		);
		expect(result).toMatchObject({
			isColdRestore: true,
			previousCwd: "/repo",
			resumeCommand: "codex resume session-456",
		});
		expect(mockUpsertSessionLocationCalls).toContainEqual({
			paneId: "pane-codex-missing",
			tabId: "tab-codex-missing",
			workspaceId: "ws-1",
			workspaceName: undefined,
			workspacePath: undefined,
			rootPath: undefined,
			cwd: "/repo",
			command: "codex --dangerously-bypass-approvals-and-sandbox",
			pid: null,
		});
	});

	it("infers codex from an env and cd-prefixed launch command", async () => {
		mockHistoryMetadata = {
			cwd: "/repo",
			cols: 120,
			rows: 32,
		};
		mockHistoryScrollback = "restored scrollback";
		mockGetSessionLocation = async () => null;

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "session-cd-env",
				resumeCommand:
					"OPENAI_API_KEY=abc codex --model gpt-5.4 resume session-cd-env",
				sourcePath: "transcript",
			};
		};

		const manager = new DaemonTerminalManager();
		const command = "cd /repo && OPENAI_API_KEY=abc codex --model gpt-5.4";
		const result = await manager.createOrAttach({
			paneId: "pane-codex-cd-env",
			tabId: "tab-codex-cd-env",
			workspaceId: "ws-1",
			command,
		});

		expect(resolveCalls).toHaveLength(1);
		expect(resolveCalls[0]?.agentId).toBe("codex");
		expect(resolveCalls[0]?.originalCommand).toBe(command);
		expect(result).toMatchObject({
			isColdRestore: true,
			previousCwd: "/repo",
			resumeCommand:
				"OPENAI_API_KEY=abc codex --model gpt-5.4 resume session-cd-env",
		});
	});

	it("infers codex from the tab title when the session row and command are missing", async () => {
		mockAppStateData = {
			tabsState: {
				tabs: [
					{
						id: "tab-codex-title",
						name: "Terminal",
						userTitle: "codex",
					},
				],
			},
		};
		mockHistoryMetadata = {
			cwd: "/repo",
			cols: 120,
			rows: 32,
		};
		mockHistoryScrollback = "restored scrollback";
		mockGetSessionLocation = async () => null;

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "session-789",
				resumeCommand: "codex resume session-789",
				sourcePath: "transcript",
			};
		};

		const manager = new DaemonTerminalManager();
		const result = await manager.createOrAttach({
			paneId: "pane-codex-title",
			tabId: "tab-codex-title",
			workspaceId: "ws-1",
		});

		expect(resolveCalls).toHaveLength(1);
		expect(resolveCalls[0]?.agentId).toBe("codex");
		expect(result).toMatchObject({
			isColdRestore: true,
			previousCwd: "/repo",
			resumeCommand: "codex resume session-789",
		});
	});

	it("falls back to the original Superset launch command when no resume target exists", async () => {
		mockHistoryMetadata = {
			cwd: "/repo",
			cols: 120,
			rows: 32,
		};
		mockHistoryScrollback = "restored scrollback";
		mockGetSessionLocation = async () => ({
			paneId: "pane-workspace-run",
			tabId: "tab-workspace-run",
			workspaceId: "ws-1",
			cwd: "/repo",
			pid: null,
			status: "exited",
			createdAt: 0,
			updatedAt: 0,
			locationKey: "ws-1:tab-workspace-run:pane-workspace-run",
			workspacePath: "/repo",
			rootPath: "/root",
			command: "pnpm dev --host 0.0.0.0",
		});
		mockResolveAgentResumeTarget = async () => null;

		const manager = new DaemonTerminalManager();
		const result = await manager.createOrAttach({
			paneId: "pane-workspace-run",
			tabId: "tab-workspace-run",
			workspaceId: "ws-1",
		});

		expect(result).toMatchObject({
			isColdRestore: true,
			previousCwd: "/repo",
			resumeCommand: "pnpm dev --host 0.0.0.0",
		});
	});

	it("does not backfill transcript identity for a brand-new Superset agent shell", async () => {
		const paneId = "pane-new-codex";
		const tabId = "tab-new-codex";
		const workspaceId = "ws-1";
		const command = "codex --dangerously-bypass-approvals-and-sandbox";
		mockGetSessionLocation = async () => ({
			paneId,
			tabId,
			workspaceId,
			cwd: "/repo",
			pid: null,
			status: "available",
			createdAt: 0,
			updatedAt: 0,
			locationKey: `${workspaceId}:${tabId}:${paneId}`,
			workspacePath: "/repo",
			rootPath: "/root",
			command,
			agentId: "codex",
		});

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "stale-session",
				resumeCommand: "codex resume stale-session",
				sourcePath: "old-transcript",
			};
		};

		const manager = new DaemonTerminalManager();
		const attachPromise = manager.createOrAttach({
			paneId,
			tabId,
			workspaceId,
			cwd: "/repo",
			command,
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		const requestId = mockClient.createOrAttachCalls[0]?.requestId;
		expect(typeof requestId).toBe("string");
		mockClient.resolveCreateOrAttach(requestId ?? "", 456);

		await expect(attachPromise).resolves.toMatchObject({
			isNew: true,
			wasRecovered: false,
		});
		expect(resolveCalls).toEqual([]);
		expect(mockUpdateSessionLocationAgentIdentityCalls).toEqual([]);
		expect(mockUpsertSessionLocationCalls).toContainEqual({
			paneId,
			tabId,
			workspaceId,
			workspaceName: undefined,
			workspacePath: undefined,
			rootPath: undefined,
			cwd: "/tmp",
			command,
			pid: 456,
		});
	});

	it("can backfill transcript identity when reattaching to an existing daemon session", async () => {
		const paneId = "pane-existing-codex";
		const tabId = "tab-existing-codex";
		const workspaceId = "ws-1";
		const command = "codex --dangerously-bypass-approvals-and-sandbox";
		const manager = new DaemonTerminalManager();
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);
		mockGetSessionLocation = async () => ({
			paneId,
			tabId,
			workspaceId,
			cwd: "/repo",
			pid: 123,
			status: "available",
			createdAt: 0,
			updatedAt: 0,
			locationKey: `${workspaceId}:${tabId}:${paneId}`,
			workspacePath: "/repo",
			rootPath: "/root",
			command,
			agentId: "codex",
		});

		const resolveCalls: Array<Record<string, unknown>> = [];
		mockResolveAgentResumeTarget = async (params) => {
			resolveCalls.push(params as Record<string, unknown>);
			return {
				agentId: "codex",
				sessionId: "current-session",
				resumeCommand: "codex resume current-session",
				sourcePath: "transcript",
			};
		};

		const attachPromise = manager.createOrAttach({
			paneId,
			tabId,
			workspaceId,
			cwd: "/repo",
			command,
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		const requestId = mockClient.createOrAttachCalls[0]?.requestId;
		expect(typeof requestId).toBe("string");
		mockClient.resolveCreateOrAttach(requestId ?? "", 456);

		await expect(attachPromise).resolves.toMatchObject({
			isNew: true,
			wasRecovered: false,
		});
		expect(resolveCalls).toHaveLength(1);
		expect(resolveCalls[0]).toMatchObject({
			agentId: "codex",
			sessionId: undefined,
			originalCommand: command,
		});
		expect(mockUpdateSessionLocationAgentIdentityCalls).toEqual([
			{
				paneId,
				agentId: "codex",
				agentSessionId: "current-session",
			},
		]);
	});

	it("supersedes older createOrAttach requests for the same pane", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-attach-1";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);

		const firstPromise = manager.createOrAttach({
			paneId,
			requestId: "req-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		const secondPromise = manager.createOrAttach({
			paneId,
			requestId: "req-2",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});

		await expect(firstPromise).rejects.toThrow(
			TERMINAL_ATTACH_CANCELED_MESSAGE,
		);
		expect(mockClient.cancelCreateOrAttachCalls).toEqual([
			{ sessionId: paneId, requestId: "req-1" },
		]);

		mockClient.resolveCreateOrAttach("req-2", 456);
		await expect(secondPromise).resolves.toMatchObject({
			isNew: true,
			wasRecovered: false,
			snapshot: {
				cwd: "/tmp",
			},
		});
		expect(
			mockClient.createOrAttachCalls.map(({ sessionId, requestId }) => ({
				sessionId,
				requestId,
			})),
		).toEqual([
			{ sessionId: paneId, requestId: "req-1" },
			{ sessionId: paneId, requestId: "req-2" },
		]);
	});

	it("reuses a helper joinPending attach when a request-scoped attach starts later", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-attach-helper-first";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);

		const helperPromise = manager.createOrAttach({
			paneId,
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
			joinPending: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		const mountedPromise = manager.createOrAttach({
			paneId,
			requestId: "req-mounted",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});

		expect(mockClient.createOrAttachCalls).toHaveLength(1);
		expect(mockClient.cancelCreateOrAttachCalls).toEqual([]);

		const helperRequestId = mockClient.createOrAttachCalls[0]?.requestId;
		expect(typeof helperRequestId).toBe("string");
		mockClient.resolveCreateOrAttach(helperRequestId ?? "", 456);

		await expect(helperPromise).resolves.toMatchObject({
			isNew: true,
			wasRecovered: false,
		});
		await expect(mountedPromise).resolves.toMatchObject({
			isNew: true,
			wasRecovered: false,
		});
	});

	it("does not dispatch stale daemon work after canceling before dispatch", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-attach-blocked";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);
		mockClient.blockCreateOrAttach();

		const attachPromise = manager.createOrAttach({
			paneId,
			requestId: "req-blocked",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		manager.cancelCreateOrAttach({ paneId, requestId: "req-blocked" });
		await expect(attachPromise).rejects.toThrow(
			TERMINAL_ATTACH_CANCELED_MESSAGE,
		);

		mockClient.releaseCreateOrAttach();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockClient.createOrAttachCalls).toEqual([]);
	});

	it("aborts pending attaches during reset", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-reset-attach";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
			sessions: Map<string, SessionInfo>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);
		mockClient.blockCreateOrAttach();

		const attachPromise = manager.createOrAttach({
			paneId,
			requestId: "req-reset",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		manager.reset();
		await expect(attachPromise).rejects.toThrow(
			TERMINAL_ATTACH_CANCELED_MESSAGE,
		);

		mockClient.releaseCreateOrAttach();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(managerInternals.sessions.size).toBe(0);
		expect(managerInternals.daemonAliveSessionIds.has(paneId)).toBe(false);
	});

	/**
	 * Reproduction for #2748: TERMINAL_ATTACH_CANCELED when opening worktrees.
	 *
	 * WorkspaceInitEffects creates a tab and then calls createOrAttach for the
	 * same paneId that the Terminal lifecycle hook also attaches to. When BOTH
	 * calls omit joinPending, the second supersedes the first, aborting it with
	 * TERMINAL_ATTACH_CANCELED. The fix is for the caller (WorkspaceInitEffects)
	 * to pass joinPending: true so the two calls share one pending promise.
	 */
	it("cancels first attach when two non-joinPending calls race for the same pane (#2748)", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-worktree-race";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);

		// Lifecycle hook fires first (has requestId, no joinPending)
		const lifecyclePromise = manager.createOrAttach({
			paneId,
			requestId: "req-lifecycle",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		// WorkspaceInitEffects fires second (no requestId, no joinPending)
		const initEffectsPromise = manager.createOrAttach({
			paneId,
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});

		// The lifecycle call is aborted — this is the bug the user sees
		await expect(lifecyclePromise).rejects.toThrow(
			TERMINAL_ATTACH_CANCELED_MESSAGE,
		);

		// The second call proceeds but if WorkspaceInitEffects had used
		// joinPending: true, both calls would have shared one promise
		const secondRequestId = mockClient.createOrAttachCalls.at(-1)?.requestId;
		expect(typeof secondRequestId).toBe("string");
		mockClient.resolveCreateOrAttach(secondRequestId ?? "");
		await expect(initEffectsPromise).resolves.toBeDefined();
	});

	it("joinPending avoids cancellation when WorkspaceInitEffects and lifecycle race (#2748 fix)", async () => {
		const manager = new DaemonTerminalManager();
		const paneId = "pane-worktree-fix";
		const managerInternals = manager as unknown as {
			daemonSessionIdsHydrated: boolean;
			daemonAliveSessionIds: Set<string>;
		};
		managerInternals.daemonSessionIdsHydrated = true;
		managerInternals.daemonAliveSessionIds = new Set([paneId]);

		// Lifecycle hook fires first (has requestId, no joinPending)
		const lifecyclePromise = manager.createOrAttach({
			paneId,
			requestId: "req-lifecycle-fix",
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		// WorkspaceInitEffects fires second WITH joinPending: true (the fix)
		const initEffectsPromise = manager.createOrAttach({
			paneId,
			tabId: "tab-1",
			workspaceId: "ws-1",
			skipColdRestore: true,
			joinPending: true,
		});

		// No cancellation! Both share the same promise
		expect(mockClient.cancelCreateOrAttachCalls).toEqual([]);
		expect(mockClient.createOrAttachCalls).toHaveLength(1);

		const requestId = mockClient.createOrAttachCalls[0]?.requestId;
		expect(typeof requestId).toBe("string");
		mockClient.resolveCreateOrAttach(requestId ?? "");

		await expect(lifecyclePromise).resolves.toMatchObject({ isNew: true });
		await expect(initEffectsPromise).resolves.toMatchObject({ isNew: true });
	});

	it("propagates probe failures from forceKillAll instead of silently no-oping", async () => {
		const manager = new DaemonTerminalManager();
		mockClient.listSessionsIfRunningError = new Error("probe failed");

		await expect(manager.forceKillAll()).rejects.toThrow("probe failed");
		expect(mockClient.killAllCalls).toBe(0);
	});
});
