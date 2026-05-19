import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import type { SpawnOptions } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ApiClient } from "../api-client";

const originalEnv = {
	SUPERSET_HOME_DIR: process.env.SUPERSET_HOME_DIR,
	SUPERSET_HOST_BIN: process.env.SUPERSET_HOST_BIN,
	SUPERSET_API_URL: process.env.SUPERSET_API_URL,
	RELAY_URL: process.env.RELAY_URL,
};
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "superset-cli-spawn-"));
const hostBin = path.join(tempHome, "superset-host");
fs.writeFileSync(hostBin, "");

process.env.SUPERSET_HOME_DIR = tempHome;
process.env.SUPERSET_HOST_BIN = hostBin;
process.env.SUPERSET_API_URL = "https://api.example.com";
process.env.RELAY_URL = "https://relay.example.com";

const childProcess = {
	pid: 24_680,
	kill: mock(() => true),
	unref: mock(() => {}),
};
const spawnMock = mock(
	(_command: string, _args: string[], _options: SpawnOptions) => childProcess,
);
mock.module("node:child_process", () => ({
	spawn: spawnMock,
}));
mock.module("./relay-url", () => ({
	getRelayUrl: mock(async () => "https://relay.example.com"),
}));

const originalFetch = globalThis.fetch;
const fetchMock = mock(async () => new Response(null, { status: 200 }));
globalThis.fetch = fetchMock as unknown as typeof fetch;

const { spawnHostService } = await import("./spawn");
const { writeConfig } = await import("../config");

function createApiClient(): ApiClient {
	return {
		analytics: {
			featureFlagPayload: {
				query: mock(async () => ({ url: "https://relay.example.com" })),
			},
		},
	} as unknown as ApiClient;
}

function restoreEnvValue(key: keyof typeof originalEnv): void {
	const value = originalEnv[key];
	if (value === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = value;
	}
}

function lastSpawnEnv(): NodeJS.ProcessEnv {
	const call = spawnMock.mock.calls.at(-1);
	if (!call) throw new Error("expected host service to be spawned");
	const options = call[2];
	if (!options?.env) throw new Error("expected spawn env to be present");
	return options.env;
}

async function spawnWithToken(sessionToken: string) {
	return spawnHostService({
		organizationId: "org_test",
		sessionToken,
		api: createApiClient(),
		port: 49_321,
		daemon: false,
	});
}

afterEach(() => {
	spawnMock.mockClear();
	childProcess.kill.mockClear();
	childProcess.unref.mockClear();
	fetchMock.mockClear();
	fs.rmSync(path.join(tempHome, "host"), { recursive: true, force: true });
	fs.rmSync(path.join(tempHome, "config.json"), { force: true });
	fs.rmSync(path.join(tempHome, "config.json.tmp"), { force: true });
});

afterAll(() => {
	globalThis.fetch = originalFetch;
	restoreEnvValue("SUPERSET_HOME_DIR");
	restoreEnvValue("SUPERSET_HOST_BIN");
	restoreEnvValue("SUPERSET_API_URL");
	restoreEnvValue("RELAY_URL");
	fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("spawnHostService", () => {
	it("passes the current auth config path and access token to the host child", async () => {
		await spawnWithToken("access-token-for-bootstrap");

		const env = lastSpawnEnv();
		expect(env.AUTH_TOKEN).toBe("access-token-for-bootstrap");
		expect(env.SUPERSET_AUTH_CONFIG_PATH).toBe(
			path.join(tempHome, "config.json"),
		);
	});

	it("does not pass the stored refresh token through the host child env", async () => {
		const refreshToken =
			"refresh-token-value-that-should-not-leak-HOST-AUTH-001";
		writeConfig({
			auth: {
				accessToken: "access-token",
				refreshToken,
				expiresAt: Date.now() + 60_000,
			},
		});

		await spawnWithToken("access-token");

		const env = lastSpawnEnv();
		const leakedEntries = Object.entries(env).filter(
			([, value]) => value === refreshToken,
		);

		expect(leakedEntries).toEqual([]);
		expect(env.SUPERSET_AUTH_REFRESH_TOKEN).toBeUndefined();
		expect(env.REFRESH_TOKEN).toBeUndefined();
		expect(env.OAUTH_REFRESH).toBeUndefined();
	});
});
