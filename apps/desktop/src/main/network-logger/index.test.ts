import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	isNetworkLoggingEnabled,
	purgeNetworkLogs,
	startNetworkLogger,
	stopNetworkLogger,
} from "./index";

const ENABLE_ENV_VAR = "SUPERSET_ENABLE_NETWORK_LOG";

type StartOptions = { captureMode?: string; maxFileSize?: number };

let userDataDir = "";
let startCalls: Array<[string, StartOptions]> = [];

const netLog = {
	startLogging: mock((logPath: string, options: StartOptions) => {
		startCalls.push([logPath, options]);
		return Promise.resolve();
	}),
	stopLogging: mock(() => Promise.resolve()),
};

const logsDir = () => path.join(userDataDir, "network-logs");

beforeEach(() => {
	userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "superset-netlog-"));
	startCalls = [];
	delete process.env[ENABLE_ENV_VAR];
});

afterEach(async () => {
	await stopNetworkLogger();
	delete process.env[ENABLE_ENV_VAR];
	fs.rmSync(userDataDir, { recursive: true, force: true });
});

describe("startNetworkLogger", () => {
	test("does not record network traffic unless logging is opted into", async () => {
		await startNetworkLogger({ userDataDir, netLog, argv: [] });

		expect(startCalls).toHaveLength(0);
	});

	test("purges logs left behind by earlier always-on releases", async () => {
		fs.mkdirSync(logsDir(), { recursive: true });
		const leaked = path.join(logsDir(), "current.json");
		const leakedArchive = path.join(logsDir(), "session-2026-01-01.json");
		fs.writeFileSync(leaked, "Authorization: Bearer leaked-token");
		fs.writeFileSync(leakedArchive, "Cookie: session=leaked");

		await startNetworkLogger({ userDataDir, netLog, argv: [] });

		expect(fs.existsSync(leaked)).toBe(false);
		expect(fs.existsSync(leakedArchive)).toBe(false);
	});

	test("records when explicitly enabled via env var", async () => {
		process.env[ENABLE_ENV_VAR] = "1";

		await startNetworkLogger({ userDataDir, netLog, argv: [] });

		expect(startCalls).toHaveLength(1);
	});

	test("records when explicitly enabled via CLI flag", async () => {
		await startNetworkLogger({
			userDataDir,
			netLog,
			argv: ["electron", "--enable-network-log"],
		});

		expect(startCalls).toHaveLength(1);
	});

	test("never captures sensitive headers, even when enabled", async () => {
		process.env[ENABLE_ENV_VAR] = "1";

		await startNetworkLogger({ userDataDir, netLog, argv: [] });

		expect(startCalls[0]?.[1].captureMode).not.toBe("includeSensitive");
	});

	test("restricts log directory and file permissions to the owner", async () => {
		process.env[ENABLE_ENV_VAR] = "1";

		await startNetworkLogger({ userDataDir, netLog, argv: [] });

		const dirMode = fs.statSync(logsDir()).mode & 0o777;
		const fileMode =
			fs.statSync(path.join(logsDir(), "current.json")).mode & 0o777;
		expect(dirMode).toBe(0o700);
		expect(fileMode).toBe(0o600);
	});
});

describe("purgeNetworkLogs", () => {
	test("removes current and archived captures", () => {
		fs.mkdirSync(logsDir(), { recursive: true });
		fs.writeFileSync(path.join(logsDir(), "current.json"), "{}");
		fs.writeFileSync(path.join(logsDir(), "session-a.json"), "{}");
		fs.writeFileSync(path.join(logsDir(), "unrelated.txt"), "keep");

		purgeNetworkLogs(userDataDir);

		expect(fs.readdirSync(logsDir())).toEqual(["unrelated.txt"]);
	});

	test("is a no-op when no logs were ever written", () => {
		expect(() => purgeNetworkLogs(userDataDir)).not.toThrow();
	});
});

describe("isNetworkLoggingEnabled", () => {
	test("is disabled by default", () => {
		expect(isNetworkLoggingEnabled([])).toBe(false);
	});

	test("is enabled by the --enable-network-log flag", () => {
		expect(isNetworkLoggingEnabled(["electron", "--enable-network-log"])).toBe(
			true,
		);
	});

	test("ignores unrelated env values", () => {
		process.env[ENABLE_ENV_VAR] = "0";

		expect(isNetworkLoggingEnabled([])).toBe(false);
	});
});
