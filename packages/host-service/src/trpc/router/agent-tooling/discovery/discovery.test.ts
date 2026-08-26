import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SlashCommand } from "@superset/shared/slash-commands";
import type { SlashCommandDiscoveryEntry } from "../registry";
import {
	clearSlashCommandDiscoveryCache,
	listAgentSlashCommands,
} from "./discovery";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "discovery-test-"));
	clearSlashCommandDiscoveryCache();
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	clearSlashCommandDiscoveryCache();
});

function entry(command: string): SlashCommand {
	return {
		name: command,
		aliases: [],
		description: "",
		argumentHint: "",
		kind: "custom",
		source: "project",
		entryKind: "command",
		trigger: "/",
	};
}

function countingRegistry(presetId: string): {
	registry: SlashCommandDiscoveryEntry[];
	calls: () => number;
} {
	let calls = 0;
	return {
		registry: [
			{
				presetId,
				resolveConfigDir: (_env, homeDir) => homeDir,
				scan: async () => {
					calls += 1;
					return [entry(`scan-${calls}`)];
				},
			},
		],
		calls: () => calls,
	};
}

describe("listAgentSlashCommands", () => {
	it("returns empty for an agent without discovery, touching nothing", async () => {
		const result = await listAgentSlashCommands({
			worktreePath: join(root, "definitely-missing"),
			agentId: "gemini",
			presetId: "gemini",
			env: {},
			homeDir: root,
		});
		expect(result).toEqual([]);
	});

	it("resolves the claude config dir from CLAUDE_CONFIG_DIR, else homeDir/.claude", async () => {
		const configured = join(root, "work-account");
		mkdirSync(join(configured, "commands"), { recursive: true });
		writeFileSync(join(configured, "commands", "from-env.md"), "");
		mkdirSync(join(root, ".claude", "commands"), { recursive: true });
		writeFileSync(join(root, ".claude", "commands", "from-home.md"), "");
		const worktree = join(root, "wt");
		mkdirSync(worktree, { recursive: true });

		const fromEnv = await listAgentSlashCommands({
			worktreePath: worktree,
			agentId: "claude-env",
			presetId: "claude",
			env: { CLAUDE_CONFIG_DIR: configured },
			homeDir: root,
		});
		expect(
			fromEnv.filter((c) => c.kind === "custom").map((c) => c.name),
		).toEqual(["from-env"]);

		const fromHome = await listAgentSlashCommands({
			worktreePath: worktree,
			agentId: "claude-home",
			presetId: "claude",
			env: {},
			homeDir: root,
		});
		expect(
			fromHome.filter((c) => c.kind === "custom").map((c) => c.name),
		).toEqual(["from-home"]);
	});

	it("coalesces concurrent calls onto one scan and caches within the TTL", async () => {
		const { registry, calls } = countingRegistry("claude");
		const options = {
			worktreePath: root,
			agentId: "claude",
			presetId: "claude",
			env: {},
			homeDir: root,
			registry,
		};
		const [first, second] = await Promise.all([
			listAgentSlashCommands(options),
			listAgentSlashCommands(options),
		]);
		expect(calls()).toBe(1);
		expect(first).toEqual(second);
		await listAgentSlashCommands(options);
		expect(calls()).toBe(1);
	});

	it("rescans after the TTL elapses", async () => {
		const { registry, calls } = countingRegistry("claude");
		let time = 0;
		const options = {
			worktreePath: root,
			agentId: "claude",
			presetId: "claude",
			env: {},
			homeDir: root,
			registry,
			now: () => time,
		};
		await listAgentSlashCommands(options);
		time = 29_999;
		await listAgentSlashCommands(options);
		expect(calls()).toBe(1);
		time = 30_000;
		await listAgentSlashCommands(options);
		expect(calls()).toBe(2);
	});

	it("evicts a rejected scan immediately", async () => {
		let calls = 0;
		const registry: SlashCommandDiscoveryEntry[] = [
			{
				presetId: "claude",
				resolveConfigDir: (_env, homeDir) => homeDir,
				scan: async () => {
					calls += 1;
					if (calls === 1) throw new Error("flaky read");
					return [entry("recovered")];
				},
			},
		];
		const options = {
			worktreePath: root,
			agentId: "claude",
			presetId: "claude",
			env: {},
			homeDir: root,
			registry,
		};
		await expect(listAgentSlashCommands(options)).rejects.toThrow("flaky read");
		const result = await listAgentSlashCommands(options);
		expect(result.map((command) => command.name)).toEqual(["recovered"]);
	});

	it("bounds the cache, evicting the least recently used key", async () => {
		const { registry, calls } = countingRegistry("claude");
		const base = {
			presetId: "claude",
			env: {},
			homeDir: root,
			registry,
		};
		for (let index = 0; index < 65; index++) {
			await listAgentSlashCommands({
				...base,
				worktreePath: root,
				agentId: `agent-${index}`,
			});
		}
		expect(calls()).toBe(65);
		// agent-0 was evicted by the 65th insert; agent-64 is still cached.
		await listAgentSlashCommands({
			...base,
			worktreePath: root,
			agentId: "agent-64",
		});
		expect(calls()).toBe(65);
		await listAgentSlashCommands({
			...base,
			worktreePath: root,
			agentId: "agent-0",
		});
		expect(calls()).toBe(66);
	});
});
