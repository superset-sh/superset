import { describe, expect, it, mock } from "bun:test";
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isLinuxZombieStat } from "../lib/process-state";
import {
	extractHostInfoVersion,
	type HostManifest,
	isMainModule,
	isUnchangedHostManifest,
	removeStaleHostManifest,
	rollbackInstall,
	runCommand,
	signalDetachedProcessGroup,
	verifyAuthenticatedHost,
} from "./main";

const HOST_MANIFEST: HostManifest = {
	pid: 1234,
	endpoint: "http://127.0.0.1:4879",
	authToken: "secret",
	startedAt: 1000,
	organizationId: "00000000-0000-4000-8000-000000000123",
	version: "1.14.0",
};

describe("Node entrypoint detection", () => {
	it("matches the executed JavaScript path without Bun import.meta.main", () => {
		expect(
			isMainModule(
				"file:///tmp/superset-supervisor.js",
				"/tmp/superset-supervisor.js",
			),
		).toBe(true);
		expect(
			isMainModule("file:///tmp/superset-supervisor.js", "/tmp/other.js"),
		).toBe(false);
		expect(isMainModule("file:///tmp/superset-supervisor.js", undefined)).toBe(
			false,
		);
	});
});

describe("Linux process state", () => {
	it("treats zombie processes as exited", () => {
		expect(isLinuxZombieStat("1550 (node <defunct>) Z 1 1550 1550")).toBe(true);
		expect(isLinuxZombieStat("1829 (node) S 1 1829 1829")).toBe(false);
	});
});

describe("extractHostInfoVersion", () => {
	it("reads the non-batched superjson tRPC envelope", () => {
		expect(
			extractHostInfoVersion({
				result: { data: { json: { version: "1.14.2" } } },
			}),
		).toBe("1.14.2");
	});

	it.each([
		null,
		{},
		{ result: {} },
		{ result: { data: { json: {} } } },
		{ result: { data: { json: { version: 1142 } } } },
	])("rejects malformed payload %#", (payload) => {
		expect(extractHostInfoVersion(payload)).toBeNull();
	});
});

describe("rollbackInstall", () => {
	it("atomically restores the retained backup", () => {
		const directory = mkdtempSync(join(tmpdir(), "host-supervisor-rollback-"));
		const installRoot = join(directory, "install");
		const backupRoot = `${installRoot}.bak`;
		mkdirSync(installRoot);
		mkdirSync(backupRoot);
		writeFileSync(join(installRoot, "version"), "new");
		writeFileSync(join(backupRoot, "version"), "old");

		try {
			rollbackInstall(installRoot);
			expect(readFileSync(join(installRoot, "version"), "utf8")).toBe("old");
			expect(existsSync(backupRoot)).toBe(false);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("does not disturb the current install when no backup exists", () => {
		const directory = mkdtempSync(join(tmpdir(), "host-supervisor-rollback-"));
		const installRoot = join(directory, "install");
		mkdirSync(installRoot);
		writeFileSync(join(installRoot, "version"), "current");

		try {
			expect(() => rollbackInstall(installRoot)).toThrow(
				/Previous install backup is missing/,
			);
			expect(readFileSync(join(installRoot, "version"), "utf8")).toBe(
				"current",
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

describe("recovery manifest", () => {
	it("removes a stale manifest before asking the CLI to restart", () => {
		const homeDir = mkdtempSync(join(tmpdir(), "host-supervisor-manifest-"));
		const manifest = join(
			homeDir,
			"host",
			HOST_MANIFEST.organizationId,
			"manifest.json",
		);
		mkdirSync(dirname(manifest), { recursive: true });
		writeFileSync(manifest, JSON.stringify(HOST_MANIFEST));

		try {
			removeStaleHostManifest(HOST_MANIFEST.organizationId, homeDir);
			expect(existsSync(manifest)).toBe(false);
		} finally {
			rmSync(homeDir, { recursive: true, force: true });
		}
	});
});

describe("authenticated host identity", () => {
	it("requires every manifest identity field to remain unchanged", () => {
		expect(isUnchangedHostManifest(HOST_MANIFEST, { ...HOST_MANIFEST })).toBe(
			true,
		);
		expect(
			isUnchangedHostManifest(HOST_MANIFEST, {
				...HOST_MANIFEST,
				pid: HOST_MANIFEST.pid + 1,
			}),
		).toBe(false);
		expect(
			isUnchangedHostManifest(HOST_MANIFEST, {
				...HOST_MANIFEST,
				authToken: "replacement-secret",
			}),
		).toBe(false);
	});

	it("authenticates the unchanged host before it can be signaled", async () => {
		const queryVersion = mock(async () => "1.14.0");
		await expect(
			verifyAuthenticatedHost({
				expectedManifest: HOST_MANIFEST,
				expectedVersion: "1.14.0",
				readCurrentManifest: () => ({ ...HOST_MANIFEST }),
				queryVersion,
			}),
		).resolves.toEqual(HOST_MANIFEST);
		expect(queryVersion).toHaveBeenCalledTimes(1);
	});

	it("refuses changed, unreachable, or wrong-version hosts", async () => {
		const queryVersion = mock(async () => "1.14.0");
		await expect(
			verifyAuthenticatedHost({
				expectedManifest: HOST_MANIFEST,
				expectedVersion: "1.14.0",
				readCurrentManifest: () => ({ ...HOST_MANIFEST, pid: 9999 }),
				queryVersion,
			}),
		).rejects.toThrow(/manifest changed/);
		expect(queryVersion).not.toHaveBeenCalled();

		await expect(
			verifyAuthenticatedHost({
				expectedManifest: HOST_MANIFEST,
				expectedVersion: "1.14.0",
				readCurrentManifest: () => ({ ...HOST_MANIFEST }),
				queryVersion: async () => null,
			}),
		).rejects.toThrow(/reported unreachable/);
		await expect(
			verifyAuthenticatedHost({
				expectedManifest: HOST_MANIFEST,
				expectedVersion: "1.14.0",
				readCurrentManifest: () => ({ ...HOST_MANIFEST }),
				queryVersion: async () => "1.15.0",
			}),
		).rejects.toThrow(/reported 1.15.0/);
	});
});

describe("bounded supervisor commands", () => {
	it("signals the detached process group instead of one child pid", () => {
		const signalProcess = mock(() => true as const);
		signalDetachedProcessGroup(4321, "SIGTERM", signalProcess);
		expect(signalProcess).toHaveBeenCalledWith(-4321, "SIGTERM");
	});

	it("times out and terminates the whole detached command group", async () => {
		const child = new EventEmitter() as EventEmitter & {
			pid: number;
			stdout?: undefined;
			stderr?: undefined;
			unref: () => void;
		};
		const unref = mock(() => undefined);
		child.pid = 4321;
		child.unref = unref;
		const spawnProcess = mock(() => child) as unknown as typeof spawn;
		const signalProcessGroup = mock(() => undefined);
		const log = mock(() => undefined);

		await expect(
			runCommand("fake-command", ["--flag"], {
				log,
				timeoutMs: 5,
				terminationGraceMs: 5,
				spawnProcess,
				signalProcessGroup,
			}),
		).rejects.toThrow(/timed out after 5ms/);

		expect(signalProcessGroup).toHaveBeenNthCalledWith(1, 4321, "SIGTERM");
		expect(signalProcessGroup).toHaveBeenNthCalledWith(2, 4321, "SIGKILL");
		const spawnOptions = (
			spawnProcess as unknown as { mock: { calls: unknown[][] } }
		).mock.calls[0]?.[2] as { detached?: boolean } | undefined;
		expect(spawnOptions?.detached).toBe(true);
		expect(unref).toHaveBeenCalledTimes(1);
	});
});
