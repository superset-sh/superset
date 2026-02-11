import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type { SessionInfo } from "./types";

class MockTerminalHostClient extends EventEmitter {
	killCalls: Array<{ sessionId: string; deleteHistory?: boolean }> = [];

	async kill(params: { sessionId: string; deleteHistory?: boolean }) {
		this.killCalls.push(params);
	}

	async listSessions() {
		return { sessions: [] };
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

const { DaemonTerminalManager } = await import("./daemon-manager");

describe("DaemonTerminalManager kill tracking", () => {
	beforeEach(() => {
		mockClient = new MockTerminalHostClient();
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
});
