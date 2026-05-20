import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandTree } from "@superset/cli-framework";
import type { ApiClient } from "../../lib/api-client";
import type { LoginResult } from "../../lib/auth";
import type { SpawnHostOptions, SpawnHostResult } from "../../lib/host/spawn";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalSupersetApiKey = process.env.SUPERSET_API_KEY;
const tempHome = fs.mkdtempSync(
	path.join(os.tmpdir(), "superset-cli-start-auth-"),
);
process.env.SUPERSET_HOME_DIR = tempHome;
delete process.env.SUPERSET_API_KEY;

const organization = { id: "org-1", name: "Acme" };
const analyticsMutateMock = mock(async () => undefined);
const myOrganizationQueryMock = mock(async () => organization);
const fakeApi = {
	analytics: {
		captureEvent: {
			mutate: analyticsMutateMock,
		},
	},
	user: {
		myOrganization: {
			query: myOrganizationQueryMock,
		},
	},
} as unknown as ApiClient;

const createApiClientMock = mock(
	(_options: { bearer: string; organizationId?: string }): ApiClient => fakeApi,
);
const refreshAccessTokenMock = mock(
	async (_refreshToken: string): Promise<LoginResult> => ({
		accessToken: "refreshed-access-token",
		refreshToken: "rotated-refresh-token",
		expiresAt: Date.now() + 60 * 60 * 1000,
	}),
);
const spawnHostServiceMock = mock(
	async (_options: SpawnHostOptions): Promise<SpawnHostResult> => ({
		pid: 12_345,
		port: 54_321,
		secret: "host-secret",
	}),
);

const clackIntroMock = mock(() => undefined);
const clackOutroMock = mock(() => undefined);
const clackSpinnerStartMock = mock(() => undefined);
const clackSpinnerStopMock = mock(() => undefined);
const clackSpinnerMock = mock(() => ({
	start: clackSpinnerStartMock,
	stop: clackSpinnerStopMock,
}));
const clackInfoMock = mock(() => undefined);

mock.module("../../lib/api-client", () => ({
	createApiClient: createApiClientMock,
}));

mock.module("../../lib/auth", () => ({
	refreshAccessToken: refreshAccessTokenMock,
}));

mock.module("../../lib/host/spawn", () => ({
	spawnHostService: spawnHostServiceMock,
}));

mock.module("@clack/prompts", () => ({
	intro: clackIntroMock,
	outro: clackOutroMock,
	spinner: clackSpinnerMock,
	log: {
		info: clackInfoMock,
	},
}));

const { run } = await import("@superset/cli-framework");
const { readConfig, writeConfig } = await import("../../lib/config");
const startCommand = (await import("./command")).default;
const cliMiddleware = (await import("../middleware")).default;
const cliConfig = (await import("../../../cli.config")).default;
const commandTree: CommandTree = {
	commands: [
		{
			path: ["start"],
			command:
				startCommand as unknown as CommandTree["commands"][number]["command"],
		},
	],
	groups: [],
	middleware: cliMiddleware,
};

class ProcessExit extends Error {
	constructor(public readonly code: number | string | null | undefined) {
		super(`process.exit(${String(code)})`);
		this.name = "ProcessExit";
	}
}

type RunResult = {
	exitCode?: number | string | null;
	stderr: string;
	stdout: string;
};

type WriteCallback = (error?: Error | null) => void;

async function runStartCommand(args: string[]): Promise<RunResult> {
	const originalArgv = process.argv;
	const stderrChunks: string[] = [];
	const stdoutChunks: string[] = [];

	const stderrSpy = spyOn(process.stderr, "write").mockImplementation(((
		chunk: string | Uint8Array,
		encodingOrCallback?: BufferEncoding | WriteCallback,
		callback?: WriteCallback,
	): boolean => {
		stderrChunks.push(
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
		);
		const done =
			typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
		done?.();
		return true;
	}) as typeof process.stderr.write);
	const logSpy = spyOn(console, "log").mockImplementation(
		(...values: unknown[]): void => {
			stdoutChunks.push(values.map(String).join(" "));
		},
	);
	const exitSpy = spyOn(process, "exit").mockImplementation(((
		code?: number | string | null,
	): never => {
		throw new ProcessExit(code);
	}) as typeof process.exit);

	process.argv = ["bun", "superset", ...args];
	try {
		await run({
			name: cliConfig.name,
			version: cliConfig.version,
			globals: cliConfig.globals,
			tree: commandTree,
		});
		return { stderr: stderrChunks.join(""), stdout: stdoutChunks.join("\n") };
	} catch (error) {
		if (error instanceof ProcessExit) {
			return {
				exitCode: error.code,
				stderr: stderrChunks.join(""),
				stdout: stdoutChunks.join("\n"),
			};
		}
		throw error;
	} finally {
		process.argv = originalArgv;
		stderrSpy.mockRestore();
		logSpy.mockRestore();
		exitSpy.mockRestore();
	}
}

function clearConfig(): void {
	writeConfig({});
}

beforeEach(() => {
	clearConfig();
	delete process.env.SUPERSET_API_KEY;
});

afterEach(() => {
	clearConfig();
	analyticsMutateMock.mockClear();
	myOrganizationQueryMock.mockClear();
	createApiClientMock.mockClear();
	refreshAccessTokenMock.mockClear();
	spawnHostServiceMock.mockClear();
	clackIntroMock.mockClear();
	clackOutroMock.mockClear();
	clackSpinnerStartMock.mockClear();
	clackSpinnerStopMock.mockClear();
	clackSpinnerMock.mockClear();
	clackInfoMock.mockClear();
});

afterAll(() => {
	fs.rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalSupersetApiKey === undefined) {
		delete process.env.SUPERSET_API_KEY;
	} else {
		process.env.SUPERSET_API_KEY = originalSupersetApiKey;
	}
});

describe("superset start auth middleware", () => {
	it("exits non-zero with the login hint before spawning when no session exists", async () => {
		const result = await runStartCommand(["start"]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Run: superset auth login");
		expect(createApiClientMock).not.toHaveBeenCalled();
		expect(myOrganizationQueryMock).not.toHaveBeenCalled();
		expect(spawnHostServiceMock).not.toHaveBeenCalled();
	});

	it("spawns the host with the on-disk access token when the session is valid", async () => {
		writeConfig({
			auth: {
				accessToken: "on-disk-access-token",
				refreshToken: "stored-refresh-token",
				expiresAt: Date.now() + 10 * 60 * 1000,
			},
			organizationId: organization.id,
		});

		const result = await runStartCommand(["start", "--daemon"]);

		expect(result.exitCode).toBeUndefined();
		expect(refreshAccessTokenMock).not.toHaveBeenCalled();
		expect(myOrganizationQueryMock).toHaveBeenCalledTimes(1);
		expect(spawnHostServiceMock).toHaveBeenCalledTimes(1);
		expect(spawnHostServiceMock.mock.calls[0]?.[0]).toMatchObject({
			organizationId: organization.id,
			sessionToken: "on-disk-access-token",
			daemon: true,
		});
	});

	it("refreshes a near-expired session in middleware before spawning", async () => {
		writeConfig({
			auth: {
				accessToken: "stale-access-token",
				refreshToken: "stored-refresh-token",
				expiresAt: Date.now() + 60 * 1000,
			},
			organizationId: organization.id,
		});

		const result = await runStartCommand(["start", "--daemon"]);

		expect(result.exitCode).toBeUndefined();
		expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
		expect(refreshAccessTokenMock).toHaveBeenCalledWith("stored-refresh-token");
		expect(spawnHostServiceMock).toHaveBeenCalledTimes(1);
		expect(spawnHostServiceMock.mock.calls[0]?.[0]).toMatchObject({
			organizationId: organization.id,
			sessionToken: "refreshed-access-token",
			daemon: true,
		});
		expect(readConfig().auth).toMatchObject({
			accessToken: "refreshed-access-token",
			refreshToken: "rotated-refresh-token",
		});
	});
});
