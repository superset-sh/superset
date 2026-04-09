import { beforeAll, describe, expect, it, mock } from "bun:test";

let SshWorkspaceRuntime: typeof import("./ssh").SshWorkspaceRuntime;
let SshTerminalManager: typeof import("../ssh/ssh-terminal-manager").SshTerminalManager;

const testConfig = {
	host: "localhost",
	port: 22,
	user: "dev",
	workDir: "/workspace",
};

describe("SshWorkspaceRuntime", () => {
	beforeAll(async () => {
		mock.module("electron", () => ({
			app: {
				getPath: (name: string) => `/tmp/superset-test-${name}`,
			},
		}));

		({ SshWorkspaceRuntime } = await import("./ssh"));
		({ SshTerminalManager } = await import("../ssh/ssh-terminal-manager"));
	});

	describe("capabilities", () => {
		it("has persistent terminal and no cold restore", () => {
			const runtime = new SshWorkspaceRuntime("ws-1", testConfig);

			expect(runtime.capabilities.terminal.persistent).toBe(true);
			expect(runtime.capabilities.terminal.coldRestore).toBe(false);
		});
	});

	describe("management", () => {
		it("provides non-null management stub", () => {
			const runtime = new SshWorkspaceRuntime("ws-1", testConfig);

			expect(runtime.terminal.management).not.toBeNull();
			expect(typeof runtime.terminal.management.listSessions).toBe("function");
			expect(typeof runtime.terminal.management.killAllSessions).toBe(
				"function",
			);
			expect(typeof runtime.terminal.management.resetHistoryPersistence).toBe(
				"function",
			);
		});
	});

	describe("terminal", () => {
		it("is backed by SshTerminalManager", () => {
			const runtime = new SshWorkspaceRuntime("ws-1", testConfig);

			expect(runtime.terminal).toBeInstanceOf(SshTerminalManager);
		});

		it("exposes expected session operation methods", () => {
			const runtime = new SshWorkspaceRuntime("ws-1", testConfig);

			expect(typeof runtime.terminal.createOrAttach).toBe("function");
			expect(typeof runtime.terminal.write).toBe("function");
			expect(typeof runtime.terminal.resize).toBe("function");
			expect(typeof runtime.terminal.kill).toBe("function");
			expect(typeof runtime.terminal.detach).toBe("function");
			expect(typeof runtime.terminal.signal).toBe("function");
		});

		it("exposes workspace operations", () => {
			const runtime = new SshWorkspaceRuntime("ws-1", testConfig);

			expect(typeof runtime.terminal.killByWorkspaceId).toBe("function");
			expect(typeof runtime.terminal.getSessionCountByWorkspaceId).toBe(
				"function",
			);
		});
	});

	describe("identity", () => {
		it("stores workspace id", () => {
			const runtime = new SshWorkspaceRuntime("ws-abc", testConfig);

			expect(runtime.id).toBe("ws-abc");
		});
	});
});
