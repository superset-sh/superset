import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { SshConnectionConfig } from "./types";

const baseConfig: SshConnectionConfig = {
	host: "test.example.com",
	port: 2222,
	user: "dev",
	workDir: "/workspace",
};

const configWithKey: SshConnectionConfig = {
	...baseConfig,
	identityFile: "/tmp/key",
};

function createMockChild(opts?: {
	emitStdout?: string;
	emitStderr?: string;
	exitCode?: number;
}) {
	const child = new EventEmitter() as EventEmitter & {
		stdin: EventEmitter & { write: () => void; end: () => void };
		stdout: EventEmitter;
		stderr: EventEmitter;
		kill: () => boolean;
	};
	child.stdin = Object.assign(new EventEmitter(), {
		write: () => {},
		end: () => {},
	});
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = () => true;

	setTimeout(() => {
		if (opts?.emitStdout)
			child.stdout.emit("data", Buffer.from(opts.emitStdout));
		if (opts?.emitStderr)
			child.stderr.emit("data", Buffer.from(opts.emitStderr));
		child.emit("close", opts?.exitCode ?? 0);
	}, 5);

	return child as unknown as ChildProcess;
}

let SshConnectionManager: typeof import("./connection-manager").SshConnectionManager;
let spawnCalls: Array<{ binary: string; args: string[] }>;
const spawnMock = mock((..._args: unknown[]) => createMockChild());

describe("SshConnectionManager", () => {
	beforeAll(async () => {
		const childProcessModule = await import("node:child_process");
		spyOn(childProcessModule, "spawn").mockImplementation(((
			...args: unknown[]
		) => {
			spawnCalls.push({
				binary: args[0] as string,
				args: args[1] as string[],
			});
			return spawnMock(...args);
		}) as typeof childProcessModule.spawn);

		mock.module("electron", () => ({
			app: {
				getPath: (name: string) => `/tmp/superset-test-${name}`,
			},
		}));

		({ SshConnectionManager } = await import("./connection-manager"));
	});

	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		spawnCalls = [];
		spawnMock.mockImplementation(() => createMockChild());
	});

	describe("constructor", () => {
		it("sets controlDir under /tmp/superset-ssh", () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-abc");
			expect(mgr.controlDir).toBe("/tmp/superset-ssh");
		});

		it("sets controlPath using the short workspace id", () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-abc");
			expect(mgr.controlPath).toBe("/tmp/superset-ssh/ctl-wsabc");
		});

		it("does NOT place controlPath under .ssh", () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-abc");
			expect(mgr.controlPath).not.toContain("/.ssh/");
		});
	});

	describe("SSH args construction", () => {
		it("includes ControlPath with workspaceId", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			const controlPathArg = args.find((a) => a.startsWith("ControlPath="));
			expect(controlPathArg).toBeDefined();
			expect(controlPathArg).toBe("ControlPath=/tmp/superset-ssh/ctl-ws123");
		});

		it("includes ServerAliveInterval=60", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			expect(args).toContain("ServerAliveInterval=60");
		});

		it("includes ConnectTimeout=10", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			expect(args).toContain("ConnectTimeout=10");
		});

		it("includes port from config", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			const portIdx = args.indexOf("-p");
			expect(portIdx).toBeGreaterThan(-1);
			expect(args[portIdx + 1]).toBe("2222");
		});

		it("includes user@host", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			expect(args).toContain("dev@test.example.com");
		});

		it("includes -i flag when identityFile is set", async () => {
			const mgr = new SshConnectionManager(configWithKey, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			const iIdx = args.indexOf("-i");
			expect(iIdx).toBeGreaterThan(-1);
			expect(args[iIdx + 1]).toBe("/tmp/key");
		});

		it("does NOT include -i flag when identityFile is not set", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("whoami");

			const args = spawnCalls[0]!.args;
			expect(args).not.toContain("-i");
		});

		it("appends the command after -- separator", async () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			await mgr.exec("ls -la");

			const args = spawnCalls[0]!.args;
			const dashDashIdx = args.indexOf("--");
			expect(dashDashIdx).toBeGreaterThan(-1);
			expect(args[dashDashIdx + 1]).toBe("ls -la");
		});
	});

	describe("exec", () => {
		it("resolves with stdout, stderr, and exitCode", async () => {
			spawnMock.mockImplementationOnce(() =>
				createMockChild({
					emitStdout: "hello",
					emitStderr: "warning",
					exitCode: 0,
				}),
			);

			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			const result = await mgr.exec("echo hello");

			expect(result.stdout).toBe("hello");
			expect(result.stderr).toBe("warning");
			expect(result.exitCode).toBe(0);
		});
	});

	describe("spawn", () => {
		it("uses -tt flag for PTY allocation", () => {
			const mgr = new SshConnectionManager(baseConfig, "ws-123");
			mgr.spawn("bash");

			expect(spawnCalls[0]!.args).toContain("-tt");
		});
	});
});
