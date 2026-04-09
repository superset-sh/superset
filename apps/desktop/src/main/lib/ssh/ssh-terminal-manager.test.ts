import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { SshConnectionManager } from "./connection-manager";
import { SshTerminalManager } from "./ssh-terminal-manager";
import type { ZmxSessionManager } from "./zmx-manager";

function createMockPty() {
	let dataCallback: ((data: string) => void) | null = null;
	let exitCallback:
		| ((e: { exitCode: number; signal?: number }) => void)
		| null = null;

	return {
		pid: 12345,
		onData: mock((cb: (data: string) => void) => {
			dataCallback = cb;
			return {
				dispose: () => {
					dataCallback = null;
				},
			};
		}),
		onExit: mock((cb: (e: { exitCode: number; signal?: number }) => void) => {
			exitCallback = cb;
			return {
				dispose: () => {
					exitCallback = null;
				},
			};
		}),
		write: mock(() => {}),
		resize: mock(() => {}),
		kill: mock(() => {}),
		_emitData: (data: string) => dataCallback?.(data),
		_emitExit: (exitCode: number, signal?: number) =>
			exitCallback?.({ exitCode, signal }),
	};
}

function createMockDeps() {
	const ptys: ReturnType<typeof createMockPty>[] = [];

	const mockConn = {
		ensureAlive: mock(async () => {}),
		exec: mock(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
		spawnPty: mock(() => {
			const pty = createMockPty();
			ptys.push(pty);
			return pty;
		}),
	} as unknown as SshConnectionManager;

	const mockZmx = {
		hasSession: mock(async () => false),
		killSession: mock(async () => {}),
		sanitizeSessionName: (id: string) => `superset-${id}`,
		listSessions: mock(async () => []),
	} as unknown as ZmxSessionManager;

	return { mockConn, mockZmx, ptys };
}

const baseParams = {
	paneId: "pane-1",
	tabId: "tab-1",
	workspaceId: "ws-1",
	cwd: "/workspace",
	cols: 80,
	rows: 24,
};

describe("SshTerminalManager", () => {
	let manager: SshTerminalManager;
	let deps: ReturnType<typeof createMockDeps>;

	beforeEach(() => {
		deps = createMockDeps();
		manager = new SshTerminalManager(deps.mockConn, deps.mockZmx);
	});

	describe("createOrAttach", () => {
		it("spawns a zmx attach command when none exists", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);

			const result = await manager.createOrAttach(baseParams);

			expect(deps.mockConn.spawnPty).toHaveBeenCalledTimes(1);
			expect(deps.mockConn.spawnPty).toHaveBeenCalledWith(
				"cd '/workspace' && ~/.local/bin/zmx attach 'superset-pane-1'",
				{ cols: 80, rows: 24 },
			);
			expect(result.isNew).toBe(true);
			expect(result.wasRecovered).toBe(false);
		});

		it("marks attach as recovered when zmx session exists", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(true);

			const result = await manager.createOrAttach(baseParams);

			expect(deps.mockConn.spawnPty).toHaveBeenCalledTimes(1);
			expect(result.isNew).toBe(false);
			expect(result.wasRecovered).toBe(true);
			expect(result.scrollback).toBe("");
			expect(result.snapshot?.cwd).toBe("/workspace");
		});
	});

	describe("data events", () => {
		it("emits data event when pty receives data", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);

			await manager.createOrAttach(baseParams);

			const received: string[] = [];
			manager.on("data:pane-1", (data: string) => {
				received.push(data);
			});

			deps.ptys[0]?._emitData("hello world");

			expect(received).toHaveLength(1);
			expect(received[0]).toBe("hello world");
		});

		it("keeps buffering output from pty data", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);

			await manager.createOrAttach(baseParams);

			const received: string[] = [];
			manager.on("data:pane-1", (data: string) => {
				received.push(data);
			});

			deps.ptys[0]?._emitData("error output");
			deps.ptys[0]?._emitData(" more");

			expect(received).toEqual(["error output", " more"]);
			expect(manager.getSession("pane-1")?.lastActive).toBeTypeOf("number");
		});
	});

	describe("kill", () => {
		it("destroys zmx session and emits exit event", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			const exitEvents: unknown[] = [];
			manager.on("exit:pane-1", (...args: unknown[]) => {
				exitEvents.push(args);
			});

			await manager.kill({ paneId: "pane-1" });

			expect(zmx.killSession).toHaveBeenCalledTimes(1);
			expect(zmx.killSession).toHaveBeenCalledWith("pane-1");
			expect(exitEvents).toHaveLength(1);
			expect(exitEvents[0]).toEqual([0, undefined, "killed"]);
		});

		it("kills the SSH process", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			await manager.kill({ paneId: "pane-1" });

			expect(deps.ptys[0]?.kill).toHaveBeenCalledTimes(1);
		});
	});

	describe("detach", () => {
		it("preserves the session and does NOT emit exit event", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			const exitEvents: unknown[] = [];
			manager.on("exit:pane-1", (...args: unknown[]) => {
				exitEvents.push(args);
			});

			manager.detach({ paneId: "pane-1" });

			expect(deps.ptys[0]?.kill).not.toHaveBeenCalled();
			expect(manager.getSession("pane-1")).not.toBeNull();
			expect(manager.getSession("pane-1")?.isAlive).toBe(true);
			expect(manager.getSession("pane-1")?.cwd).toBe("/workspace");
			expect(exitEvents).toHaveLength(0);
		});

		it("stops forwarding data after detach", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			const received: string[] = [];
			manager.on("data:pane-1", (data: string) => {
				received.push(data);
			});

			manager.detach({ paneId: "pane-1" });
			deps.ptys[0]?._emitData("after detach");

			expect(manager.getSession("pane-1")).not.toBeNull();
			expect(received).toHaveLength(0);
			expect(deps.ptys[0]?.kill).not.toHaveBeenCalled();
		});
	});

	describe("killByWorkspaceId", () => {
		it("kills SSH processes and remote zmx sessions", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);

			const ptys: ReturnType<typeof createMockPty>[] = [];
			const conn = deps.mockConn as unknown as Record<string, any>;
			conn.spawnPty.mockImplementation(() => {
				const p = createMockPty();
				ptys.push(p);
				return p;
			});

			await manager.createOrAttach({
				...baseParams,
				paneId: "p1",
				workspaceId: "ws-target",
			});
			await manager.createOrAttach({
				...baseParams,
				paneId: "p2",
				workspaceId: "ws-target",
			});
			await manager.createOrAttach({
				...baseParams,
				paneId: "p3",
				workspaceId: "ws-target",
			});

			const result = await manager.killByWorkspaceId("ws-target");

			expect(zmx.killSession).toHaveBeenCalledTimes(3);
			expect(result.killed).toBe(3);
			expect(result.failed).toBe(0);
			for (const p of ptys) {
				expect(p.kill).toHaveBeenCalledTimes(1);
			}
		});

		it("only kills sessions matching the workspace id", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			const conn = deps.mockConn as unknown as Record<string, any>;
			conn.spawnPty.mockImplementation(() => createMockPty());

			await manager.createOrAttach({
				...baseParams,
				paneId: "p1",
				workspaceId: "ws-target",
			});
			await manager.createOrAttach({
				...baseParams,
				paneId: "p2",
				workspaceId: "ws-other",
			});

			const result = await manager.killByWorkspaceId("ws-target");

			expect(result.killed).toBe(1);
			const otherSession = manager.getSession("p2");
			expect(otherSession).not.toBeNull();
			expect(otherSession?.isAlive).toBe(true);
		});
	});

	describe("write", () => {
		it("forwards data to the pty", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			manager.write({ paneId: "pane-1", data: "hello" });

			expect(deps.ptys[0]?.write).toHaveBeenCalledWith("hello");
		});

		it("does nothing for unknown pane", () => {
			manager.write({ paneId: "nonexistent", data: "hello" });
			expect(deps.ptys).toHaveLength(0);
		});
	});

	describe("resize", () => {
		it("calls only pty resize", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			manager.resize({ paneId: "pane-1", cols: 100, rows: 30 });

			expect(deps.ptys[0]?.resize).toHaveBeenCalledWith(100, 30);
			expect(
				(deps.mockZmx as unknown as Record<string, any>).resize,
			).toBeUndefined();
		});
	});

	describe("clearScrollback", () => {
		it("clears buffered output without remote exec", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			deps.ptys[0]?._emitData("buffered output");
			manager.clearScrollback({ paneId: "pane-1" });

			const recovered = await manager.createOrAttach(baseParams);
			expect(recovered.scrollback).toBe("");
			expect(deps.mockConn.exec).not.toHaveBeenCalled();
		});
	});

	describe("getSession", () => {
		it("returns session info for active session", async () => {
			const zmx = deps.mockZmx as unknown as Record<string, any>;
			zmx.hasSession.mockResolvedValue(false);
			await manager.createOrAttach(baseParams);

			const session = manager.getSession("pane-1");

			expect(session).not.toBeNull();
			expect(session?.isAlive).toBe(true);
			expect(session?.cwd).toBe("/workspace");
		});

		it("returns null for unknown pane", () => {
			expect(manager.getSession("nonexistent")).toBeNull();
		});
	});

	describe("capabilities", () => {
		it("has persistent true and coldRestore false", () => {
			expect(manager.capabilities.persistent).toBe(true);
			expect(manager.capabilities.coldRestore).toBe(false);
		});
	});

	describe("management", () => {
		it("provides stub management methods", async () => {
			expect(manager.management).not.toBeNull();
			expect(typeof manager.management.listSessions).toBe("function");
			expect(typeof manager.management.killAllSessions).toBe("function");
			expect(typeof manager.management.resetHistoryPersistence).toBe(
				"function",
			);
		});
	});
});
