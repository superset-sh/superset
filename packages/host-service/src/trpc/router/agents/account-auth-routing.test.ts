import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SessionAccount } from "../usage/session-account/session-account";
import { validateAccountAuthRouting } from "./account-auth-routing";

describe("explicit account authentication routing", () => {
	let root: string;
	let cwd: string;
	let account: SessionAccount & { directory: string };
	let options: Required<
		NonNullable<Parameters<typeof validateAccountAuthRouting>[2]>
	>;
	async function put(path: string, content: string) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content);
	}
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "superset-account-routing-"));
		cwd = join(root, "home", "project");
		await mkdir(join(cwd, ".git"), { recursive: true });
		account = {
			agent: "claude",
			selection: join(root, "home", ".claude-work"),
			directory: join(root, "home", ".claude-work"),
			identity: "test-account",
			credentialKind: "subscription",
			pinned: true,
		};
		options = {
			homeDir: join(root, "home"),
			os: "linux",
			systemDir: join(root, "system"),
			managedPreferencesDir: join(root, "managed"),
			username: "test-user",
		};
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test("accepts absent files and ordinary Claude model, hook and permission settings", async () => {
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).resolves.toBeUndefined();
		await put(
			join(account.directory, "settings.json"),
			JSON.stringify({
				model: "sonnet",
				hooks: {},
				permissions: { deny: ["Read(.env)"] },
				env: { API_TIMEOUT_MS: "30000" },
			}),
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).resolves.toBeUndefined();
	});

	test.each([
		{ apiKeyHelper: "read-test-key" },
		{ forceLoginMethod: "console" },
		{ forceLoginMethod: "gateway" },
		{ forceLoginOrgUUID: "other-org" },
		{ env: { ANTHROPIC_AUTH_TOKEN: "test-token" } },
		{ env: { ANTHROPIC_CUSTOM_HEADERS: "Authorization: test-token" } },
		{ env: { CLAUDE_CONFIG_DIR: "/other-profile" } },
		{ env: { HOME: "/other-home" } },
		{ env: { USER: "other-keychain-account" } },
	])("rejects profile credential routing: %j", async (settings) => {
		await put(
			join(account.directory, "settings.json"),
			JSON.stringify(settings),
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("rejects workspace settings and main-worktree local settings", async () => {
		await put(
			join(cwd, ".claude", "settings.json"),
			'{"apiKeyHelper":"test-helper"}',
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("Nothing was launched");
		await rm(join(cwd, ".claude"), { recursive: true });
		await rm(join(cwd, ".git"), { recursive: true });
		const main = join(root, "main");
		const gitDir = join(main, ".git", "worktrees", "checkout");
		await put(join(cwd, ".git"), `gitdir: ${gitDir}\n`);
		await put(join(gitDir, "commondir"), "../..\n");
		await put(
			join(main, ".claude", "settings.local.json"),
			'{"env":{"ANTHROPIC_API_KEY":"test-key"}}',
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("Nothing was launched");
	});

	test("does not confuse the unselected system profile with project settings", async () => {
		await put(
			join(root, "home", ".claude", "settings.json"),
			'{"apiKeyHelper":"other-profile-helper"}',
		);
		await rm(join(cwd, ".git"), { recursive: true });
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).resolves.toBeUndefined();
	});

	test("rejects credential routing from managed drop-ins without running helpers", async () => {
		await put(
			join(options.systemDir, "managed-settings.d", "20-auth.json"),
			'{"policyHelper":"should-not-execute"}',
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("Nothing was launched");
	});

	test("fails closed on unparsed macOS managed policy", async () => {
		await put(
			join(options.managedPreferencesDir, "com.anthropic.claudecode.plist"),
			"policy",
		);
		await expect(
			validateAccountAuthRouting(account, cwd, { ...options, os: "darwin" }),
		).rejects.toThrow("managed authentication policy");
	});

	test("refuses an inconclusive managed preference probe", async () => {
		await put(options.managedPreferencesDir, "not a directory");
		await expect(
			validateAccountAuthRouting(account, cwd, { ...options, os: "darwin" }),
		).rejects.toThrow("managed authentication policy");
	});

	test.each([
		"claude",
		"codex",
	] as const)("accepts ordinary macOS %s preferences but refuses managed preferences", async (agent) => {
		account = { ...account, agent };
		const domain =
			agent === "claude" ? "com.anthropic.claudecode" : "com.openai.codex";
		await put(
			join(options.homeDir, "Library/Preferences", `${domain}.plist`),
			"ordinary preferences",
		);
		const macOptions = { ...options, os: "darwin" as const };
		await expect(
			validateAccountAuthRouting(account, cwd, macOptions),
		).resolves.toBeUndefined();
		await put(
			join(options.managedPreferencesDir, options.username, `${domain}.plist`),
			"managed preferences",
		);
		await expect(
			validateAccountAuthRouting(account, cwd, macOptions),
		).rejects.toThrow("managed authentication policy");
	});

	test("accepts ordinary Codex configuration with real TOML syntax", async () => {
		account = { ...account, agent: "codex" };
		await put(
			join(account.directory, "config.toml"),
			`
model = 'gpt-test'
model_provider = 'openai'
forced_login_method = 'chatgpt'
cli_auth_credentials_store = 'file'
[mcp_servers.local]
command = 'node'
args = ['server.js']
[projects.'/some/project']
trust_level = 'trusted'
`,
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).resolves.toBeUndefined();
	});

	test.each([
		'model_provider = "custom"',
		'"model_providers" = { custom = { env_key = "OTHER_KEY" } }',
		'[model_providers.custom]\nexperimental_bearer_token = "test-token"',
		'profile = "work"',
		'forced_login_method = "api"',
		'cli_auth_credentials_store = "keyring"',
		'chatgpt_base_url = "https://example.test"',
	])("rejects Codex alternate authentication: %s", async (config) => {
		account = { ...account, agent: "codex" };
		await put(join(account.directory, "config.toml"), config);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("Codex authentication");
	});

	test("rejects Codex system requirements selecting a different credential store", async () => {
		account = { ...account, agent: "codex" };
		await put(
			join(options.systemDir, "requirements.toml"),
			'cli_auth_credentials_store = "auto"',
		);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("Codex authentication");
	});

	test("rejects malformed JSON and TOML without echoing their contents", async () => {
		for (const agent of ["claude", "codex"] as const) {
			const filename = agent === "claude" ? "settings.json" : "config.toml";
			await put(
				join(account.directory, filename),
				"invalid-secret-test-value = {",
			);
			let error: unknown;
			try {
				await validateAccountAuthRouting({ ...account, agent }, cwd, options);
			} catch (caught) {
				error = caught;
			}
			expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
			expect(String(error)).not.toContain("invalid-secret-test-value");
		}
	});

	test("bounds config reads and rejects non-file settings", async () => {
		const file = join(account.directory, "settings.json");
		await put(file, " ".repeat(2 * 1024 * 1024 + 1));
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("configuration file");
		await rm(file);
		await mkdir(file);
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("configuration file");
	});

	test("checks symlinked settings at their destination", async () => {
		const actual = join(root, "dotfiles", "settings.json");
		await put(actual, '{"apiKeyHelper":"test-helper"}');
		await mkdir(account.directory, { recursive: true });
		await symlink(actual, join(account.directory, "settings.json"));
		await expect(
			validateAccountAuthRouting(account, cwd, options),
		).rejects.toThrow("Nothing was launched");
	});

	test("checks the real project ancestors when the working folder is a symlink", async () => {
		const nested = join(cwd, "packages", "app");
		await mkdir(nested, { recursive: true });
		const alias = join(root, "shortcut");
		await symlink(nested, alias);
		await put(
			join(cwd, ".claude", "settings.json"),
			'{"apiKeyHelper":"parent-project-helper"}',
		);
		await expect(
			validateAccountAuthRouting(account, alias, options),
		).rejects.toThrow("Nothing was launched");
	});
});
