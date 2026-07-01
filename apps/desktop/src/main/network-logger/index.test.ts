import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type StartLoggingOptions = {
	captureMode: string;
	maxFileSize: number;
};

let tmpDir = "";
let startLoggingCalls: Array<{
	logPath: string;
	options: StartLoggingOptions;
}> = [];

const netLogMock = {
	startLogging: mock((logPath: string, options: StartLoggingOptions) => {
		startLoggingCalls.push({ logPath, options });
		fs.writeFileSync(logPath, '{"events":[\n]}');
		return Promise.resolve();
	}),
	stopLogging: mock(() => Promise.resolve()),
};

mock.module("electron", () => ({
	app: { getPath: () => tmpDir },
	session: { fromPartition: () => ({ netLog: netLogMock }) },
}));

const {
	isNetworkLoggingEnabled,
	resolveMaxFileBytes,
	startNetworkLogger,
	stopNetworkLogger,
} = await import("./index");

const ONE_GIB = 1024 * 1024 * 1024;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "netlog-test-"));
	startLoggingCalls = [];
	delete process.env.SUPERSET_NETWORK_LOG;
	delete process.env.SUPERSET_NETWORK_LOG_MAX_MB;
});

afterEach(async () => {
	await stopNetworkLogger();
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("network-logger unbounded growth (#5276)", () => {
	test("default per-session size cap is far below the 1 GB that caused disk pressure", () => {
		// The reported bug: a single session-*.json reached ~994 MB because the
		// cap was 1 GiB. A reasonable cap keeps per-session logs bounded.
		expect(resolveMaxFileBytes()).toBeLessThanOrEqual(50 * 1024 * 1024);
		expect(resolveMaxFileBytes()).toBeLessThan(ONE_GIB);
	});

	test("netLog is started with the capped maxFileSize, not 1 GiB", async () => {
		await startNetworkLogger();
		expect(startLoggingCalls).toHaveLength(1);
		expect(startLoggingCalls[0]?.options.maxFileSize).toBeLessThanOrEqual(
			50 * 1024 * 1024,
		);
	});

	test("SUPERSET_NETWORK_LOG=false disables logging entirely (escape hatch)", async () => {
		process.env.SUPERSET_NETWORK_LOG = "false";
		expect(isNetworkLoggingEnabled()).toBe(false);
		await startNetworkLogger();
		expect(startLoggingCalls).toHaveLength(0);
	});

	test("logging is enabled by default", () => {
		expect(isNetworkLoggingEnabled()).toBe(true);
	});

	test("disable flag accepts common falsey spellings", () => {
		for (const value of ["false", "0", "off", "no", "FALSE", " false "]) {
			process.env.SUPERSET_NETWORK_LOG = value;
			expect(isNetworkLoggingEnabled()).toBe(false);
		}
	});

	test("SUPERSET_NETWORK_LOG_MAX_MB overrides the default cap", () => {
		process.env.SUPERSET_NETWORK_LOG_MAX_MB = "10";
		expect(resolveMaxFileBytes()).toBe(10 * 1024 * 1024);
	});

	test("invalid SUPERSET_NETWORK_LOG_MAX_MB falls back to the default cap", () => {
		process.env.SUPERSET_NETWORK_LOG_MAX_MB = "not-a-number";
		expect(resolveMaxFileBytes()).toBeLessThanOrEqual(50 * 1024 * 1024);
	});
});
