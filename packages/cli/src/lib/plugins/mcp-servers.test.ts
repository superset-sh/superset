import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writePluginConnections } from "@superset/agent-setup";
import { writeInstalledPlugins } from "./host";
import { syncPluginMcpServers } from "./mcp-servers";

// The Linear plugin's connector slug, which is not its name.
const CONNECTOR = "linear_mcp";

const ORIGINAL_HOME_DIR = process.env.SUPERSET_HOME_DIR;
const ORIGINAL_SANDBOX = process.env.SUPERSET_SANDBOX_WORKSPACE_ID;

let supersetHomeDir: string;
let homeDir: string;

function claudeServers(): Record<
	string,
	{ url?: string; headersHelper?: string }
> {
	const raw = fs.readFileSync(path.join(homeDir, ".claude.json"), "utf-8");
	return JSON.parse(raw).mcpServers ?? {};
}

function install(name: string): void {
	writeInstalledPlugins([
		{
			marketplace: "superset",
			name,
			version: "1.0.0",
			installPath: path.join(supersetHomeDir, "plugins", "cache", name),
			installedAt: "2026-10-01T00:00:00.000Z",
			enabled: true,
		},
	]);
}

beforeEach(() => {
	supersetHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "superset-cli-mcp-"));
	homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "superset-cli-home-"));
	process.env.SUPERSET_HOME_DIR = supersetHomeDir;
	delete process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
});

afterEach(() => {
	if (ORIGINAL_HOME_DIR === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = ORIGINAL_HOME_DIR;
	if (ORIGINAL_SANDBOX === undefined)
		delete process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
	else process.env.SUPERSET_SANDBOX_WORKSPACE_ID = ORIGINAL_SANDBOX;
	fs.rmSync(supersetHomeDir, { recursive: true, force: true });
	fs.rmSync(homeDir, { recursive: true, force: true });
});

describe("syncPluginMcpServers", () => {
	test("writes one unpinned entry for a connector with a single account", () => {
		install("linear");
		writePluginConnections([
			{
				connector: CONNECTOR,
				connectionId: "c1",
				externalUserId: "9f8a",
				nickname: "Work",
			},
		]);

		const result = syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(result).toEqual({ servers: 1, error: null });
		const servers = claudeServers();
		expect(Object.keys(servers)).toEqual(["linear"]);
		expect(servers.linear?.url).not.toContain("connection=");
		expect(servers.linear?.headersHelper).toContain("auth mcp-headers");
	});

	// An unpinned entry answers every call with AMBIGUOUS_CONNECTION once a second
	// account exists, which is what made the second account break every tool call.
	test("splits a two-account connector into one pinned entry each", () => {
		install("linear");
		writePluginConnections([
			{
				connector: CONNECTOR,
				connectionId: "c1",
				externalUserId: "9f8a",
				nickname: "Work",
			},
			{
				connector: CONNECTOR,
				connectionId: "c2",
				externalUserId: "1c2d",
				nickname: "Personal",
			},
		]);

		const result = syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(result.servers).toBe(2);
		const servers = claudeServers();
		expect(Object.keys(servers).sort()).toEqual([
			"linear-personal",
			"linear-work",
		]);
		expect(servers["linear-work"]?.url).toContain("connection=c1");
		expect(servers["linear-personal"]?.url).toContain("connection=c2");
	});

	test("reaps the entries of an uninstalled plugin", () => {
		install("linear");
		writePluginConnections([
			{
				connector: CONNECTOR,
				connectionId: "c1",
				externalUserId: "9f8a",
				nickname: "Work",
			},
		]);
		syncPluginMcpServers({ homeDir, supersetHomeDir });

		writeInstalledPlugins([]);
		const result = syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(result).toEqual({ servers: 0, error: null });
		expect(claudeServers()).toEqual({});
	});

	// No cache is the state of a machine the desktop never ran on. One entry per
	// connector is the correct fallback; it must not be a failure.
	test("falls back to one entry per connector with no cached accounts", () => {
		install("linear");

		const result = syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(result).toEqual({ servers: 1, error: null });
		expect(Object.keys(claudeServers())).toEqual(["linear"]);
	});

	test("omits the headers helper on a cloud box, which needs none", () => {
		process.env.SUPERSET_SANDBOX_WORKSPACE_ID = "ws-1";
		install("linear");

		syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(claudeServers().linear?.headersHelper).toBeUndefined();
	});
});
