import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeInstalledPlugins } from "./host";
import { syncPluginMcpServers } from "./mcp-servers";

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
	test("writes one entry per plugin, whatever the account count", () => {
		install("linear");

		expect(syncPluginMcpServers({ homeDir, supersetHomeDir }).error).toBeNull();

		const servers = claudeServers();
		expect(Object.keys(servers)).toEqual(["linear"]);
		expect(servers.linear?.url).toBe(
			"https://api.superset.sh/mcp/plugins/superset/linear",
		);
	});

	test("names no account in the url, so the entry never has to be renamed", () => {
		install("linear");
		syncPluginMcpServers({ homeDir, supersetHomeDir });

		// The account is a tool argument the proxy resolves per call. A
		// `?connection=` here would pin one and suppress the choice.
		expect(claudeServers().linear?.url).not.toContain("connection=");
	});

	test("carries the headers helper so the entry needs no OAuth of its own", () => {
		install("linear");
		syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(claudeServers().linear?.headersHelper).toContain("auth mcp-headers");
	});

	test("reaps the entries of an uninstalled plugin", () => {
		install("linear");
		syncPluginMcpServers({ homeDir, supersetHomeDir });
		expect(Object.keys(claudeServers())).toEqual(["linear"]);

		writeInstalledPlugins([]);
		syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(Object.keys(claudeServers())).toEqual([]);
	});

	test("omits the headers helper on a cloud box, which needs none", () => {
		process.env.SUPERSET_SANDBOX_WORKSPACE_ID = "ws_1";
		install("linear");
		syncPluginMcpServers({ homeDir, supersetHomeDir });

		expect(claudeServers().linear?.headersHelper).toBeUndefined();
	});
});
