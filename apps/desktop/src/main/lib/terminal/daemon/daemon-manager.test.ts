import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import {
	TERMINAL_ATTACH_CANCELED_MESSAGE,
	TerminalAttachCanceledError,
} from "../errors";
import type { SessionInfo } from "./types";

class MockTerminalHostClient extends EventEmitter {
	createOrAttachCalls: Array<{ sessionId: string; requestId?: string }> = [];
	cancelCreateOrAttachCalls: Array<{ sessionId: string; requestId: string }> =
		[];
	killCalls: Array<{ sessionId: string; deleteHistory?: boolean }> = [];
	killAllCalls = 0;
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
	}

	async killAll(_params?: object) {
		this.killAllCalls++;
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
	appState: { data: null },
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

mock.module("../port-manager", () => ({
	portManager: {
		upsertSession: () => {},
		unregisterSession: () => {},
		checkOutputForHint: () => {},
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
		mockClient.emit("exit", paneId, 0, 15);
		expect(exitReason).toBe("killed");
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
