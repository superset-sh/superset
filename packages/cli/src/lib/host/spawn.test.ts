import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { SpawnOptions } from "node:child_process";
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

const spawnCalls: Array<{
	command: string;
	args: readonly string[];
	options: SpawnOptions;
}> = [];

const spawnMock = mock(
	(command: string, args: readonly string[], options: SpawnOptions) => {
		spawnCalls.push({ command, args, options });
		return {
			pid: 12345,
			kill: mock(() => true),
			unref: mock(() => undefined),
		};
	},
);

const { SUPERSET_CONFIG_PATH } = await import("../config");
const { spawnHostService } = await import("./spawn");

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
	test("passes SUPERSET_AUTH_CONFIG_PATH when provided", async () => {
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		await spawnHostService(
			{
				organizationId: "00000000-0000-0000-0000-000000000001",
				sessionToken: "session-token",
				authConfigPath: SUPERSET_CONFIG_PATH,
				api: createApi(),
				port: 54879,
				daemon: true,
			},
			{ spawnProcess: spawnMock },
		);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.env?.SUPERSET_AUTH_CONFIG_PATH).toBe(
			SUPERSET_CONFIG_PATH,
		);
		expect(spawnCalls[0]?.options.env?.AUTH_TOKEN).toBe("session-token");
	});
});
