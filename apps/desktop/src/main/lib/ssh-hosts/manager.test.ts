import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	getSshHostDeviceClientId,
	getSshHostRemotePort,
} from "../../../shared/ssh-hosts";

class MockSshProcess extends EventEmitter {
	public stdout = new EventEmitter();
	public stderr = new EventEmitter();
	public exitCode: number | null = null;
	public killed = false;
	private readonly stdinChunks: Buffer[] = [];
	private readonly onStdinEnd?: (stdinText: string) => void;

	public stdin = {
		write: (chunk: string | Buffer) => {
			this.stdinChunks.push(
				Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
			);
			return true;
		},
		end: () => {
			queueMicrotask(() => {
				this.onStdinEnd?.(Buffer.concat(this.stdinChunks).toString("utf8"));
			});
		},
	};

	public kill = mock(() => {
		this.killed = true;
		queueMicrotask(() => this.finish(0));
		return true;
	});

	constructor(options?: { onStdinEnd?: (stdinText: string) => void }) {
		super();
		this.onStdinEnd = options?.onStdinEnd;
	}

	public finish(
		code: number,
		options?: {
			signal?: NodeJS.Signals | null;
			stderr?: string;
			stdout?: string;
		},
	) {
		if (this.exitCode !== null) {
			return;
		}

		if (options?.stdout) {
			this.stdout.emit("data", Buffer.from(options.stdout, "utf8"));
		}
		if (options?.stderr) {
			this.stderr.emit("data", Buffer.from(options.stderr, "utf8"));
		}

		this.exitCode = code;
		this.emit("exit", code, options?.signal ?? null);
	}
}

const commandLog: string[] = [];
const uploadedFiles = new Map<string, string>();
const forwardProcesses: MockSshProcess[] = [];
const getSshHostMock = mock((_hostId: string) => ({
	id: "ssh-host-1",
	name: "Homebox",
	remoteRootDir: undefined,
	sshTarget: "dev@homebox",
}));
const getSshHostBundleMock = mock(() => ({
	bundleHash: "bundle-abc123",
	files: [
		{
			contents: Buffer.from("console.log('remote host service');", "utf8"),
			relativePath: "main/host-service.js",
		},
		{
			contents: Buffer.from("-- migration", "utf8"),
			relativePath: "host-migrations/0001.sql",
		},
	],
}));
const loadTokenMock = mock(async () => ({ token: "desktop-auth-token" }));
const fetchMock = mock(
	async () =>
		new Response(
			JSON.stringify({
				deviceClientId: getSshHostDeviceClientId("ssh-host-1"),
				deviceName: "Homebox",
				hasModelProviderCredentials: true,
				status: "ok",
				terminalMode: "tmux",
			}),
			{
				headers: { "content-type": "application/json" },
				status: 200,
			},
		),
);

let missingToolsStdout = "";
let remoteBundleAlreadyPresent = false;

const spawnMock = mock((command: string, args: string[]) => {
	if (command !== "ssh") {
		throw new Error(`Unexpected process spawn: ${command}`);
	}

	if (args.includes("-N")) {
		const forwardProcess = new MockSshProcess();
		forwardProcesses.push(forwardProcess);
		return forwardProcess as unknown as ChildProcess;
	}

	const remoteCommand = args.at(-1) ?? "";
	commandLog.push(remoteCommand);

	const uploadMatch = /cat > '([^']+)'/.exec(remoteCommand);
	const process = new MockSshProcess({
		onStdinEnd: (stdinText) => {
			if (uploadMatch) {
				uploadedFiles.set(uploadMatch[1], stdinText);
			}
			process.finish(0);
		},
	});

	queueMicrotask(() => {
		if (uploadMatch) {
			return;
		}

		if (args.includes("-G")) {
			process.finish(0, {
				stdout: [
					"hostname homebox.internal",
					"user dev",
					"port 22",
					"identityfile ~/.ssh/id_ed25519",
				].join("\n"),
			});
			return;
		}

		if (remoteCommand.includes("command -v")) {
			process.finish(0, { stdout: missingToolsStdout });
			return;
		}

		if (remoteCommand.includes("test -f")) {
			process.finish(remoteBundleAlreadyPresent ? 0 : 1, {
				stderr: remoteBundleAlreadyPresent ? undefined : "missing package.json",
			});
			return;
		}

		process.finish(0);
	});

	return process as unknown as ChildProcess;
});

let SshHostServiceManager: typeof import("./manager").SshHostServiceManager;
const originalFetch = globalThis.fetch;

describe("SshHostServiceManager", () => {
	beforeAll(async () => {
		const actualChildProcess = await import("node:child_process");
		mock.module("node:child_process", () => {
			return {
				...actualChildProcess,
				spawn: (...args: [string, string[]]) => spawnMock(...args),
			};
		});
		mock.module("./bundle", () => ({
			getSshHostBundle: () => getSshHostBundleMock(),
		}));
		mock.module("./settings", () => ({
			getSshHost: (...args: [string]) => getSshHostMock(...args),
		}));
		mock.module("lib/trpc/routers/auth/utils/auth-functions", () => ({
			loadToken: () => loadTokenMock(),
		}));
		mock.module("main/env.main", () => ({
			env: {
				NEXT_PUBLIC_API_URL: "https://api.superset.test",
			},
		}));

		globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

		({ SshHostServiceManager } = await import("./manager"));
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	beforeEach(() => {
		commandLog.length = 0;
		forwardProcesses.length = 0;
		uploadedFiles.clear();
		missingToolsStdout = "";
		remoteBundleAlreadyPresent = false;
		spawnMock.mockClear();
		getSshHostMock.mockClear();
		getSshHostBundleMock.mockClear();
		loadTokenMock.mockClear();
		fetchMock.mockClear();
	});

	it("probes the SSH target without starting a forwarded tunnel", async () => {
		const manager = new SshHostServiceManager();

		const status = await manager.probe("ssh-host-1");

		expect(status.state).toBe("idle");
		expect(status.diagnostic?.phase).toBe("probe");
		expect(status.diagnostic?.summary).toBe("SSH probe succeeded");
		expect(status.missingPrerequisites).toEqual([]);
		expect(forwardProcesses).toHaveLength(0);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("bootstraps the remote host-service and returns a forwarded local hostUrl", async () => {
		const manager = new SshHostServiceManager();

		const status = await manager.connect("ssh-host-1");

		expect(status.state).toBe("ready");
		expect(status.hostId).toBe("ssh-host-1");
		expect(status.remotePort).toBe(getSshHostRemotePort("ssh-host-1"));
		expect(status.hostUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
		expect(status.localPort).toBeGreaterThan(0);
		expect(status.missingPrerequisites).toEqual([]);
		expect(status.health).toEqual({
			deviceClientId: getSshHostDeviceClientId("ssh-host-1"),
			deviceName: "Homebox",
			hasModelProviderCredentials: true,
			status: "ok",
			terminalMode: "tmux",
		});
		expect(status.diagnostic?.phase).toBe("connect");
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const launcherPath =
			"~/.superset/ssh-hosts/ssh-host-1/bundles/bundle-abc123/launch-host-service.sh";
		expect(uploadedFiles.get(launcherPath)).toContain(
			"HOST_TERMINAL_MODE='tmux'",
		);
		expect(uploadedFiles.get(launcherPath)).toContain(
			"CLOUD_API_URL='https://api.superset.test'",
		);
		expect(
			commandLog.some((command) => command.includes("tmux new-session -d -s")),
		).toBe(true);

		await manager.disconnect("ssh-host-1");

		expect(forwardProcesses[0]?.kill).toHaveBeenCalled();
		expect(manager.getStatus("ssh-host-1").state).toBe("idle");
	});

	it("reuses the existing forwarded tunnel for repeated connects to the same host", async () => {
		const manager = new SshHostServiceManager();

		const firstStatus = await manager.connect("ssh-host-1");
		const secondStatus = await manager.connect("ssh-host-1");

		expect(forwardProcesses).toHaveLength(1);
		expect(secondStatus.state).toBe("ready");
		expect(secondStatus.hostUrl).toBe(firstStatus.hostUrl);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("captures missing remote prerequisites in the connection status", async () => {
		const manager = new SshHostServiceManager();
		missingToolsStdout = "node\nbun\n";

		await expect(manager.connect("ssh-host-1")).rejects.toThrow(
			"Remote host is missing required tools",
		);

		expect(manager.getStatus("ssh-host-1")).toMatchObject({
			diagnostic: {
				phase: "connect",
				summary: "Remote host is missing required tools: node, bun",
			},
			hostId: "ssh-host-1",
			lastError: "Remote host is missing required tools: node, bun",
			missingPrerequisites: ["node", "bun"],
			state: "error",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
