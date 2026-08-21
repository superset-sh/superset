import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginMcpServerConfig } from "@superset/shared/plugins";
import {
	readExternallyConfiguredMcpServers,
	syncManagedMcpServers,
} from "./managed-mcp-servers";

const TEST_ROOT = path.join(
	os.tmpdir(),
	`superset-managed-mcp-${process.pid}-${Date.now()}`,
);
const HOME_DIR = path.join(TEST_ROOT, "home");
const SUPERSET_HOME = path.join(TEST_ROOT, "superset-home");

const claudeJson = path.join(HOME_DIR, ".claude.json");
const codexToml = path.join(HOME_DIR, ".codex", "config.toml");
const ledgerPath = path.join(SUPERSET_HOME, "plugins", "mcp-ledger.json");

const LINEAR: PluginMcpServerConfig = {
	type: "http",
	url: "https://mcp.linear.app/mcp",
};
const PLAYWRIGHT: PluginMcpServerConfig = {
	command: "npx",
	args: ["-y", "@playwright/mcp@latest"],
};

function run(desired: Record<string, PluginMcpServerConfig>): void {
	syncManagedMcpServers(desired, {
		homeDir: HOME_DIR,
		supersetHomeDir: SUPERSET_HOME,
	});
}

function readClaude(): Record<string, unknown> {
	return JSON.parse(readFileSync(claudeJson, "utf-8"));
}

beforeEach(() => {
	mkdirSync(HOME_DIR, { recursive: true });
	mkdirSync(SUPERSET_HOME, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("syncManagedMcpServers — Claude", () => {
	it("creates ~/.claude.json with desired servers and a ledger", () => {
		run({ linear: LINEAR, playwright: PLAYWRIGHT });

		const root = readClaude();
		expect(root.mcpServers).toEqual({
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
			playwright: {
				type: "stdio",
				command: "npx",
				args: ["-y", "@playwright/mcp@latest"],
			},
		});
		const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
		expect(Object.keys(ledger.files[claudeJson])).toEqual([
			"linear",
			"playwright",
		]);
	});

	it("preserves unrelated keys and user servers in an existing file", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				hasCompletedOnboarding: true,
				mcpServers: { mine: { command: "my-server" } },
			}),
		);

		run({ linear: LINEAR });

		const root = readClaude();
		expect(root.hasCompletedOnboarding).toBe(true);
		expect(root.mcpServers).toEqual({
			mine: { command: "my-server" },
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		});
	});

	it("never overwrites a user-defined server of the same name", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				mcpServers: { linear: { command: "user-linear" } },
			}),
		);

		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toEqual({
			linear: { command: "user-linear" },
		});
		// Not tracked: uninstall must not reap the user's entry either.
		run({});
		expect(readClaude().mcpServers).toEqual({
			linear: { command: "user-linear" },
		});
	});

	it("reaps entries we wrote when they leave the desired set", () => {
		run({ linear: LINEAR, playwright: PLAYWRIGHT });
		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toEqual({
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		});
	});

	it("transfers ownership when the user edits a managed entry", () => {
		run({ linear: LINEAR });

		const root = readClaude();
		(root.mcpServers as Record<string, unknown>).linear = {
			type: "http",
			url: "https://example.com/custom",
		};
		writeFileSync(claudeJson, JSON.stringify(root));

		run({});

		expect(readClaude().mcpServers).toEqual({
			linear: { type: "http", url: "https://example.com/custom" },
		});
	});

	it("does not rewrite the file when already converged", () => {
		run({ linear: LINEAR });
		const before = statSync(claudeJson).mtimeMs;
		const raw = readFileSync(claudeJson, "utf-8");

		run({ linear: LINEAR });

		expect(readFileSync(claudeJson, "utf-8")).toBe(raw);
		expect(statSync(claudeJson).mtimeMs).toBe(before);
	});

	it("skips an unparseable file instead of clobbering it", () => {
		writeFileSync(claudeJson, "{ not json");

		run({ linear: LINEAR });

		expect(readFileSync(claudeJson, "utf-8")).toBe("{ not json");
	});

	it("creates nothing when desired is empty and no file exists", () => {
		run({});
		expect(existsSync(claudeJson)).toBe(false);
		expect(existsSync(codexToml)).toBe(false);
	});
});

describe("syncManagedMcpServers — Codex", () => {
	it("appends a managed block with url and stdio tables", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(codexToml, 'model = "gpt-5"\n');

		run({ linear: LINEAR, playwright: PLAYWRIGHT });

		const content = readFileSync(codexToml, "utf-8");
		expect(content).toContain('model = "gpt-5"');
		expect(content).toContain("[mcp_servers.linear]");
		expect(content).toContain('url = "https://mcp.linear.app/mcp"');
		expect(content).toContain("[mcp_servers.playwright]");
		expect(content).toContain('command = "npx"');
		expect(content).toContain('args = ["-y", "@playwright/mcp@latest"]');
	});

	it("skips servers the user already defines outside the block", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(codexToml, '[mcp_servers.linear]\ncommand = "user-linear"\n');

		run({ linear: LINEAR, playwright: PLAYWRIGHT });

		const content = readFileSync(codexToml, "utf-8");
		const matches = content.match(/\[mcp_servers\.linear\]/g) ?? [];
		expect(matches.length).toBe(1);
		expect(content).toContain('command = "user-linear"');
		expect(content).toContain("[mcp_servers.playwright]");
	});

	it("removes the block on empty desired set, preserving user config", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(codexToml, 'model = "gpt-5"\n');
		run({ linear: LINEAR });

		run({});

		const content = readFileSync(codexToml, "utf-8");
		expect(content).toContain('model = "gpt-5"');
		expect(content).not.toContain("[mcp_servers.linear]");
		expect(content).not.toContain("superset managed mcp servers");
	});

	it("deletes a file that held only the managed block", () => {
		run({ linear: LINEAR });
		expect(existsSync(codexToml)).toBe(true);

		run({});

		expect(existsSync(codexToml)).toBe(false);
	});

	it("leaves an unrelated config byte-for-byte untouched when nothing is installed", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		// Trailing whitespace on purpose: the empty-desired boot sync must not
		// normalize a config we never wrote into.
		const original = 'model = "gpt-5"\n\n\n';
		writeFileSync(codexToml, original);

		run({});

		expect(readFileSync(codexToml, "utf-8")).toBe(original);
	});
});

describe("syncManagedMcpServers — per-agent external scoping", () => {
	it("a Codex-only user server does not suppress the Claude write", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(
			codexToml,
			'[mcp_servers.linear]\nurl = "https://mcp.linear.app/mcp"\n',
		);

		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toEqual({
			linear: { type: "http", url: "https://mcp.linear.app/mcp" },
		});
		// Codex side stays the user's single table, no managed block added.
		const content = readFileSync(codexToml, "utf-8");
		expect(content.match(/\[mcp_servers\.linear\]/g)?.length).toBe(1);
		expect(content).not.toContain("superset managed mcp servers");
	});

	it("a Claude-scope user server suppresses Claude but not Codex", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				projects: {
					"/repo/a": {
						mcpServers: {
							"linear-server": {
								type: "http",
								url: "https://mcp.linear.app/mcp",
							},
						},
					},
				},
			}),
		);

		run({ linear: LINEAR });

		expect(readClaude().mcpServers).toBeUndefined();
		expect(readFileSync(codexToml, "utf-8")).toContain("[mcp_servers.linear]");
	});
});

describe("readExternallyConfiguredMcpServers", () => {
	function readExternal() {
		return readExternallyConfiguredMcpServers({
			homeDir: HOME_DIR,
			supersetHomeDir: SUPERSET_HOME,
		});
	}

	it("reports user-defined servers but never ledger-tracked ones", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({ mcpServers: { notion: { command: "notion-mcp" } } }),
		);

		run({ linear: LINEAR });

		expect(readExternal()).toEqual([
			{ name: "notion", command: "notion-mcp", source: "Claude Code" },
		]);
	});

	it("sweeps Claude project scopes, carrying urls for matching", () => {
		writeFileSync(
			claudeJson,
			JSON.stringify({
				projects: {
					"/repo/a": {
						mcpServers: {
							"linear-server": {
								type: "http",
								url: "https://mcp.linear.app/mcp",
							},
						},
					},
				},
			}),
		);

		expect(readExternal()).toEqual([
			{
				name: "linear-server",
				url: "https://mcp.linear.app/mcp",
				source: "Claude Code (project: a)",
			},
		]);
	});

	it("reports Codex tables outside the managed block only", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(
			codexToml,
			'[mcp_servers.posthog]\ncommand = "posthog-mcp"\nargs = ["--stdio"]\n',
		);

		run({ linear: LINEAR });

		expect(readExternal()).toEqual([
			{
				name: "posthog",
				command: "posthog-mcp",
				args: ["--stdio"],
				source: "Codex",
			},
		]);
	});

	it("reads single-quoted (TOML literal) Codex values", () => {
		mkdirSync(path.dirname(codexToml), { recursive: true });
		writeFileSync(
			codexToml,
			"[mcp_servers.my-linear]\nurl = 'https://mcp.linear.app/mcp'\n",
		);

		expect(readExternal()).toEqual([
			{
				name: "my-linear",
				url: "https://mcp.linear.app/mcp",
				source: "Codex",
			},
		]);
	});

	it("returns empty when no configs exist", () => {
		expect(readExternal()).toEqual([]);
	});
});
