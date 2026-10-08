import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncManagedMcpServers } from "./managed-mcp-servers";
import { reconcileMcpServers } from "./reconcile-mcp-servers";

let home: string;
let supersetHome: string;

const LINEAR = {
	type: "http" as const,
	url: "https://api.superset.sh/mcp/plugins/superset/linear",
};
const NOTION = {
	type: "http" as const,
	url: "https://api.superset.sh/mcp/plugins/superset/notion",
};

function claudeServers(): string[] {
	const file = path.join(home, ".claude.json");
	if (!fs.existsSync(file)) return [];
	return Object.keys(
		JSON.parse(fs.readFileSync(file, "utf-8")).mcpServers ?? {},
	);
}

function codexServers(): string[] {
	const file = path.join(home, ".codex", "config.toml");
	if (!fs.existsSync(file)) return [];
	return [
		...fs.readFileSync(file, "utf-8").matchAll(/\[mcp_servers\.([^\]]+)\]/g),
	].map((match) => match[1] as string);
}

beforeEach(() => {
	home = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-home-"));
	supersetHome = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-superset-"));
});

afterEach(() => {
	for (const dir of [home, supersetHome]) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("reconcileMcpServers", () => {
	const opts = () => ({ homeDir: home, supersetHomeDir: supersetHome });

	test("writes the desired entries when they are missing", () => {
		reconcileMcpServers({ linear: LINEAR }, opts());
		expect(claudeServers()).toEqual(["linear"]);
		expect(codexServers()).toEqual(["linear"]);
	});

	test("does nothing when the config already agrees", () => {
		reconcileMcpServers({ linear: LINEAR }, opts());
		const reports = reconcileMcpServers({ linear: LINEAR }, opts());
		expect(reports.every((report) => !report.wrote)).toBe(true);
	});

	test("reaps an entry the desired set no longer names", () => {
		reconcileMcpServers({ linear: LINEAR, notion: NOTION }, opts());
		expect(claudeServers().sort()).toEqual(["linear", "notion"]);

		reconcileMcpServers({ linear: LINEAR }, opts());
		expect(claudeServers()).toEqual(["linear"]);
		expect(codexServers()).toEqual(["linear"]);
	});

	test("an empty desired set reaps every managed entry", () => {
		reconcileMcpServers({ linear: LINEAR, notion: NOTION }, opts());
		reconcileMcpServers({}, opts());
		expect(claudeServers()).toEqual([]);
		expect(codexServers()).toEqual([]);
	});

	test("leaves a server the user configured themselves", () => {
		reconcileMcpServers({ linear: LINEAR }, opts());
		const file = path.join(home, ".claude.json");
		const root = JSON.parse(fs.readFileSync(file, "utf-8"));
		root.mcpServers.mine = { type: "http", url: "https://example.invalid" };
		fs.writeFileSync(file, JSON.stringify(root));

		reconcileMcpServers({}, opts());
		expect(claudeServers()).toEqual(["mine"]);
	});
});

describe("syncManagedMcpServers", () => {
	test("is the writer reconcile defers to", () => {
		syncManagedMcpServers(
			{ linear: LINEAR },
			{ homeDir: home, supersetHomeDir: supersetHome },
		);
		expect(claudeServers()).toEqual(["linear"]);
	});
});
