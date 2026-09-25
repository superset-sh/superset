import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
// Snapshot the real module BEFORE mock.module: bun module mocks are process-wide,
// so a partial replacement breaks other test files that import e.g. execFileSync.
import * as realChildProcess from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../api-client";

const originalFetch = globalThis.fetch;
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalHostBin = process.env.SUPERSET_HOST_BIN;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-spawn-"));
const hostBin = join(tempHome, "superset-host");

process.env.SUPERSET_HOME_DIR = tempHome;
process.env.SUPERSET_HOST_BIN = hostBin;
writeFileSync(hostBin, "");

type SpawnOptions = {
	env?: NodeJS.ProcessEnv;
	detached?: boolean;
	stdio?: unknown;
};

const spawnCalls: Array<{
	command: string;
	args: string[];
	options: SpawnOptions;
}> = [];

type ExitListener = (code: number | null, signal: string | null) => void;
const exitListeners: ExitListener[] = [];

const spawnMock = mock(
	(command: string, args: string[], options: SpawnOptions) => {
		spawnCalls.push({ command, args, options });
		return {
			pid: 12345,
			kill: mock(() => undefined),
			unref: mock(() => undefined),
			once: (event: string, listener: ExitListener) => {
				if (event === "exit") exitListeners.push(listener);
			},
		};
	},
);

mock.module("node:child_process", () => ({
	...realChildProcess,
	spawn: spawnMock,
}));

const { SUPERSET_CONFIG_PATH } = await import("../config");
const { describeHostExit, spawnHostService } = await import("./spawn");

function createApi(): ApiClient {
	return {
		analytics: {
			featureFlagPayload: {
				query: async () => null,
			},
		},
	} as unknown as ApiClient;
}

afterEach(() => {
	spawnCalls.length = 0;
	exitListeners.length = 0;
	spawnMock.mockClear();
	globalThis.fetch = originalFetch;
});

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalHostBin === undefined) {
		delete process.env.SUPERSET_HOST_BIN;
	} else {
		process.env.SUPERSET_HOST_BIN = originalHostBin;
	}
});

describe("spawnHostService", () => {
	test("reports missing superset-host with an override hint", async () => {
		process.env.SUPERSET_HOST_BIN = join(tempHome, "missing-host");
		try {
			await expect(
				spawnHostService({
					organizationId: "00000000-0000-0000-0000-000000000001",
					sessionToken: "session-token",
					api: createApi(),
					port: 54879,
					daemon: true,
				}),
			).rejects.toThrow(/superset-host binary not found .* SUPERSET_HOST_BIN/);
		} finally {
			process.env.SUPERSET_HOST_BIN = hostBin;
		}
	});

	test("explains desktop-bundled CLI cannot run the host service", async () => {
		process.env.SUPERSET_HOST_BIN = join(tempHome, "missing-host");
		process.env.SUPERSET_CLI_CHANNEL = "desktop-bundled";
		try {
			await expect(
				spawnHostService({
					organizationId: "00000000-0000-0000-0000-000000000001",
					sessionToken: "session-token",
					api: createApi(),
					port: 54879,
					daemon: true,
				}),
			).rejects.toThrow(/bundled with the Superset desktop app/);
		} finally {
			process.env.SUPERSET_HOST_BIN = hostBin;
			delete process.env.SUPERSET_CLI_CHANNEL;
		}
	});

	test("passes SUPERSET_AUTH_CONFIG_PATH when provided", async () => {
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			authConfigPath: SUPERSET_CONFIG_PATH,
			api: createApi(),
			port: 54879,
			daemon: true,
		});

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.env?.SUPERSET_AUTH_CONFIG_PATH).toBe(
			SUPERSET_CONFIG_PATH,
		);
		expect(spawnCalls[0]?.options.env?.AUTH_TOKEN).toBe("session-token");
	});

	test("reports the host process exit so the caller can stop supervising nothing", async () => {
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		const { exited } = await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			api: createApi(),
			port: 54879,
			daemon: false,
		});

		let settled = false;
		void exited.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		for (const listener of exitListeners) listener(null, "SIGSEGV");
		const exit = await exited;
		expect(exit).toEqual({ code: null, signal: "SIGSEGV" });
		expect(describeHostExit(exit)).toBe("killed by SIGSEGV");
		expect(describeHostExit({ code: 3, signal: null })).toBe("exit code 3");
	});
});
