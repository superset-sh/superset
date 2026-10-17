import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeSharedDisabledAgentIds } from "@superset/agent-setup";
import { buildArgvCommand } from "@superset/shared/agent-prompt-launch";
import type { ResolvedHostAgentConfig } from "../../../terminal-agents/agent-config";
import {
	readAccountIdentity,
	type SessionAccount,
} from "../usage/session-account/session-account";
import {
	accountLaunchUnsupportedReason,
	listLaunchAccounts,
	pinnedAccountCommandPrefix,
	prepareLaunchAccountHooks,
	resolveLaunchAccount,
	validatePinnedLaunchAccount,
} from "./launch-account";

const config: ResolvedHostAgentConfig = {
	id: "agent",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: [],
	promptTransport: "argv" as const,
	promptArgs: [],
	resumeArgs: ["--resume"],
	forkArgs: [],
	env: {},
};
const account = {
	agent: "claude",
	selection: "/profiles/work",
	directory: "/profiles/work",
	identity: "a".repeat(64),
	credentialKind: "subscription",
	email: "work@example.test",
} satisfies SessionAccount;
const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("explicit terminal account selection", () => {
	test("lists subscription metadata only and does not expose API credentials", async () => {
		const result = await listLaunchAccounts(config, async () => [
			account,
			{ ...account, credentialKind: "api_key" },
		]);
		expect(result.accounts).toEqual([
			{
				selection: account.selection,
				identity: account.identity,
				email: account.email,
				label: account.selection,
			},
		]);
	});

	test("rejects undiscovered paths, stale identities and terminal control characters", async () => {
		const discover = async () => [account];
		await expect(
			resolveLaunchAccount(
				config,
				{ selection: "/not/discovered", identity: account.identity },
				discover,
			),
		).rejects.toThrow("no longer available");
		await expect(
			resolveLaunchAccount(
				config,
				{ selection: account.selection, identity: "changed" },
				discover,
			),
		).rejects.toThrow("no longer available");
		const unsafe = {
			...account,
			selection: "/profile\ncommand",
			directory: "/profile\ncommand",
		};
		await expect(
			resolveLaunchAccount(config, unsafe, async () => [unsafe]),
		).rejects.toThrow("no longer available");
	});

	test("keeps explicit system selection distinct from inheriting a default", async () => {
		const system = {
			...account,
			selection: null,
			directory: "/home/test/.claude",
		};
		expect(
			await resolveLaunchAccount(config, system, async () => [system]),
		).toEqual({ ...system, pinned: true });
		const prefix = pinnedAccountCommandPrefix({ ...system, pinned: true }, {});
		expect(prefix).toContain("'-u' 'CLAUDE_CONFIG_DIR'");
		expect(prefix).not.toContain("'CLAUDE_CONFIG_DIR=");
	});

	test("rejects custom commands, config flags and per-agent authentication overrides", () => {
		const overrides: Partial<ResolvedHostAgentConfig>[] = [
			{ command: "custom-claude" },
			{ args: ["--settings=/other/settings.json"] },
			{ args: ["--resume", "old-session"] },
			{ args: ["resume"] },
			{ args: ["--remote", "other-server"] },
			{ args: ["--oss"] },
			{ args: ["-C", "/other"] },
			{ args: ["--cd=/other"] },
			{ args: ["-cmodel_provider=other"] },
			{ promptArgs: ["--continue"] },
			{ resumeArgs: ["--resume", "--settings", "/other"] },
			{ env: { HOME: "/other" } },
			{ env: { PATH: "/other/bin" } },
			{ env: { ANTHROPIC_API_KEY: "synthetic" } },
			{ env: { CLAUDE_CONFIG_DIR: "/other" } },
		];
		for (const changed of overrides)
			expect(
				accountLaunchUnsupportedReason({ ...config, ...changed }),
			).toBeDefined();
		expect(accountLaunchUnsupportedReason(config)).toBeUndefined();
	});

	test("accepts stock Claude and Codex arguments and exact native resume paths", () => {
		expect(
			accountLaunchUnsupportedReason({
				...config,
				args: ["--dangerously-skip-permissions"],
			}),
		).toBeUndefined();
		const codex = {
			...config,
			presetId: "codex",
			command: "codex",
			args: [
				"--dangerously-bypass-approvals-and-sandbox",
				"--dangerously-bypass-hook-trust",
			],
			promptArgs: ["--"],
			resumeArgs: ["resume"],
		};
		expect(accountLaunchUnsupportedReason(codex)).toBeUndefined();
		expect(
			accountLaunchUnsupportedReason({
				...codex,
				resumeArgs: ["resume", "--config", "model_provider=other"],
			}),
		).toBeDefined();
	});

	test("validates saved profile identity again before recovery", async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-launch-account-"));
		directories.push(dir);
		const file = join(dir, ".claude.json");
		await writeFile(
			file,
			JSON.stringify({
				oauthAccount: {
					accountUuid: "first",
					emailAddress: "first@example.test",
				},
			}),
		);
		const identity = await readAccountIdentity("claude", dir);
		if (!identity) throw new Error("Expected fixture identity");
		const pinned = {
			...account,
			...identity,
			selection: dir,
			directory: dir,
			pinned: true as const,
		};
		await validatePinnedLaunchAccount(config, pinned, {
			discover: async () => [pinned],
		});
		await writeFile(
			file,
			JSON.stringify({
				oauthAccount: {
					accountUuid: "second",
					emailAddress: "second@example.test",
				},
			}),
		);
		await expect(
			validatePinnedLaunchAccount(config, pinned, {
				discover: async () => [pinned],
			}),
		).rejects.toThrow("sign-in changed");
	});

	test("refuses recovery after a hook reported conflicting account metadata", async () => {
		await expect(
			validatePinnedLaunchAccount(
				config,
				{ ...account, pinned: true, conflict: true },
				{ validate: async () => true },
			),
		).rejects.toThrow("Nothing was launched");
	});

	test("isolates command env and retains quoted paths", () => {
		const pinned = {
			...account,
			directory: "/profiles/space 'quote $literal",
			pinned: true as const,
		};
		const script =
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell variable syntax
			'printf \'%s|%s|%s\' "$CLAUDE_CONFIG_DIR" "${ANTHROPIC_API_KEY-unset}" "$SUPERSET_PINNED_ACCOUNT"';
		const command =
			pinnedAccountCommandPrefix(pinned, {}) +
			buildArgvCommand(["bash", "-c", script]);
		const result = execFileSync("bash", ["-c", command], {
			encoding: "utf8",
			env: {
				PATH: process.env.PATH,
				CLAUDE_CONFIG_DIR: "/wrong",
				ANTHROPIC_API_KEY: "synthetic",
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/wrong",
			},
		});
		expect(result).toBe(`${pinned.directory}|unset|CLAUDE_CONFIG_DIR`);
	});
});

test("pinned Codex launch preserves the true ambient home for nested hosts", () => {
	const selected = {
		...account,
		agent: "codex" as const,
		directory: "/profiles/codex",
		selection: "/profiles/codex",
		pinned: true as const,
	};
	const probe = `import {resolveAmbientCodexHome} from ${JSON.stringify(resolve(import.meta.dir, "../../../../../agent-setup/src/provider-profiles.ts"))}; console.log(resolveAmbientCodexHome("/fixture-user"));`;
	const command =
		pinnedAccountCommandPrefix(selected, {}) +
		buildArgvCommand([process.execPath, "-e", probe]);
	expect(
		execFileSync("/bin/sh", ["-c", command], {
			encoding: "utf8",
			env: {
				PATH: process.env.PATH,
				CODEX_HOME: "/profiles/previous",
				SUPERSET_DEFAULT_CODEX_HOME: "/profiles/previous",
				SUPERSET_AMBIENT_CODEX_HOME: "/profiles/system",
			},
		}).trim(),
	).toBe("/profiles/system");
});

test("prepares only managed hooks in a selected profile and preserves its login and settings", async () => {
	const dir = await mkdtemp(join(tmpdir(), "superset-profile-hooks-"));
	directories.push(dir);
	await writeFile(join(dir, ".claude.json"), '{"fixture":"login bytes"}');
	await writeFile(
		join(dir, "settings.json"),
		JSON.stringify({
			theme: "dark",
			hooks: { Stop: [{ hooks: [{ type: "command", command: "user-hook" }] }] },
		}),
	);
	prepareLaunchAccountHooks({
		...account,
		directory: dir,
		selection: dir,
		pinned: true,
	});
	const settings = JSON.parse(
		await readFile(join(dir, "settings.json"), "utf8"),
	);
	expect(settings.theme).toBe("dark");
	expect(
		settings.hooks.Stop.some((entry: { hooks: { command: string }[] }) =>
			entry.hooks.some((hook) => hook.command === "user-hook"),
		),
	).toBe(true);
	expect(JSON.stringify(settings.hooks)).toContain("notify.sh");
	expect(await readFile(join(dir, ".claude.json"), "utf8")).toBe(
		'{"fixture":"login bytes"}',
	);
	await writeFile(join(dir, "settings.json"), "{");
	expect(() =>
		prepareLaunchAccountHooks({
			...account,
			directory: dir,
			selection: dir,
			pinned: true,
		}),
	).toThrow("hooks");
	expect(await readFile(join(dir, "settings.json"), "utf8")).toBe("{");
});

for (const agent of ["claude", "codex"] as const) {
	test(`leaves disabled ${agent} hooks and profile bytes unchanged`, async () => {
		const dir = await mkdtemp(
			join(tmpdir(), "superset-disabled-profile-hooks-"),
		);
		directories.push(dir);
		const state = await mkdtemp(
			join(tmpdir(), "superset-disabled-hooks-state-"),
		);
		directories.push(state);
		const originalHome = process.env.SUPERSET_HOME_DIR;
		const originalDisabled = process.env.SUPERSET_DISABLED_AGENT_HOOKS;
		process.env.SUPERSET_HOME_DIR = state;
		delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
		const filename = agent === "claude" ? "settings.json" : "config.toml";
		const contents =
			agent === "claude"
				? '{"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"user-hook"}]}]}}'
				: 'model = "fixture"\n';
		await writeFile(join(dir, filename), contents);
		const hookBytes =
			'{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"user-hook"}]}]}}';
		if (agent === "codex") await writeFile(join(dir, "hooks.json"), hookBytes);
		try {
			if (agent === "claude") writeSharedDisabledAgentIds([agent]);
			else process.env.SUPERSET_DISABLED_AGENT_HOOKS = agent;
			prepareLaunchAccountHooks({
				...account,
				agent,
				directory: dir,
				selection: agent === "claude" ? null : dir,
				pinned: true,
			});
			expect(await readFile(join(dir, filename), "utf8")).toBe(contents);
			if (agent === "codex")
				expect(await readFile(join(dir, "hooks.json"), "utf8")).toBe(hookBytes);
		} finally {
			if (originalHome === undefined) delete process.env.SUPERSET_HOME_DIR;
			else process.env.SUPERSET_HOME_DIR = originalHome;
			if (originalDisabled === undefined)
				delete process.env.SUPERSET_DISABLED_AGENT_HOOKS;
			else process.env.SUPERSET_DISABLED_AGENT_HOOKS = originalDisabled;
		}
	});
}
