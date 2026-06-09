import { beforeEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import type { DaemonTerminalManager } from "../terminal";
import type { SessionResult } from "../terminal/types";
import type { ListSessionsResponse } from "../terminal-host/types";

let backendCreations = 0;
let lastBackend: FakeDaemonTerminalManager | null = null;

const emptySessionList: ListSessionsResponse = { sessions: [] };

class FakeDaemonTerminalManager extends EventEmitter {
	listDaemonSessions(): Promise<ListSessionsResponse> {
		return Promise.resolve(emptySessionList);
	}

	forceKillAll(): Promise<void> {
		return Promise.resolve();
	}

	resetHistoryPersistence(): Promise<void> {
		return Promise.resolve();
	}

	createOrAttach(): Promise<SessionResult> {
		return Promise.resolve({
			isNew: true,
			scrollback: "",
			wasRecovered: false,
		});
	}

	cancelCreateOrAttach(): void {}

	write(): void {}

	resize(): void {}

	signal(): void {}

	kill(): Promise<void> {
		return Promise.resolve();
	}

	detach(): void {}

	clearScrollback(): void {}

	ackColdRestore(): void {}

	getSession(): null {
		return null;
	}

	killByWorkspaceId(): Promise<{ killed: number; failed: number }> {
		return Promise.resolve({ killed: 0, failed: 0 });
	}

	getSessionCountByWorkspaceId(): Promise<number> {
		return Promise.resolve(0);
	}

	refreshPromptsForWorkspace(): void {}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			this.removeAllListeners(event);
		}
	}

	cleanup(): Promise<void> {
		return Promise.resolve();
	}
}

const { LocalWorkspaceRuntime } = await import("./local");

function createFakeBackend(): DaemonTerminalManager {
	backendCreations++;
	lastBackend = new FakeDaemonTerminalManager();
	return lastBackend as unknown as DaemonTerminalManager;
}

describe("LocalWorkspaceRuntime", () => {
	beforeEach(() => {
		backendCreations = 0;
		lastBackend = null;
	});

	it("does not create the daemon backend for construction or capability reads", () => {
		const runtime = new LocalWorkspaceRuntime(createFakeBackend);

		expect(backendCreations).toBe(0);
		expect(runtime.capabilities.terminal).toEqual({
			persistent: true,
			coldRestore: true,
		});
		expect(runtime.terminal.capabilities.persistent).toBe(true);
		expect(runtime.terminal.management).toBeDefined();
		expect(backendCreations).toBe(0);
	});

	it("does not create the daemon backend when terminal listeners are registered and detached", () => {
		const runtime = new LocalWorkspaceRuntime(createFakeBackend);
		const listener = () => undefined;

		runtime.terminal.on("terminalExit", listener);
		expect(backendCreations).toBe(0);

		runtime.terminal.off("terminalExit", listener);
		runtime.terminal.detachAllListeners();

		expect(backendCreations).toBe(0);
	});

	it("creates the daemon backend on the first terminal management operation", async () => {
		const runtime = new LocalWorkspaceRuntime(createFakeBackend);

		await expect(runtime.terminal.management.listSessions()).resolves.toEqual(
			emptySessionList,
		);

		expect(backendCreations).toBe(1);
	});

	it("bridges listeners registered before backend creation once terminal work starts", async () => {
		const runtime = new LocalWorkspaceRuntime(createFakeBackend);
		const events: unknown[] = [];

		runtime.terminal.on("terminalExit", (event: unknown) => {
			events.push(event);
		});

		await runtime.terminal.management.listSessions();
		lastBackend?.emit("terminalExit", { paneId: "pane-1", exitCode: 0 });

		expect(events).toEqual([{ paneId: "pane-1", exitCode: 0 }]);
		expect(backendCreations).toBe(1);
	});
});
