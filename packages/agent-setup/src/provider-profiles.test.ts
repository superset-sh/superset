import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	provisionClaudeProfile,
	provisionCodexProfile,
} from "./provider-profiles";

const TEST_ROOT = path.join(
	os.tmpdir(),
	`superset-provider-profiles-${process.pid}-${Date.now()}`,
);
const HOME = path.join(TEST_ROOT, "home");
const DEFAULT_DIR = path.join(HOME, ".claude");
const PROFILE = path.join(HOME, ".claude-work");

function writeJson(filePath: string, value: unknown): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJson(filePath: string): Record<string, unknown> {
	return JSON.parse(readFileSync(filePath, "utf-8"));
}

/** A default account with something to share on every surface. */
function seedDefaultAccount(): void {
	mkdirSync(path.join(DEFAULT_DIR, "skills", "redesign"), { recursive: true });
	writeFileSync(
		path.join(DEFAULT_DIR, "skills", "redesign", "SKILL.md"),
		"# redesign",
	);
	mkdirSync(path.join(DEFAULT_DIR, "plugins"), { recursive: true });
	writeJson(path.join(DEFAULT_DIR, "plugins", "installed_plugins.json"), {
		version: 2,
	});
	mkdirSync(path.join(DEFAULT_DIR, "agents"), { recursive: true });
	writeFileSync(path.join(DEFAULT_DIR, "CLAUDE.md"), "be brief");
	writeJson(path.join(DEFAULT_DIR, "settings.json"), {
		model: "claude-opus-5",
		effortLevel: "high",
		enabledPlugins: { "superset@superset": true },
		env: { DISABLE_TELEMETRY: "1", ANTHROPIC_API_KEY: "sk-secret" },
		apiKeyHelper: "/usr/local/bin/key.sh",
		hooks: { Stop: [{ hooks: [{ type: "command", command: "user-hook" }] }] },
	});
	writeJson(path.join(HOME, ".claude.json"), {
		mcpServers: { linear: { command: "linear-mcp" } },
		theme: "dark",
		oauthAccount: { emailAddress: "default@example.com" },
		userID: "default-user",
	});
}

/** A profile that has completed its own login. */
function seedProfile(): void {
	writeJson(path.join(PROFILE, ".claude.json"), {
		oauthAccount: { emailAddress: "work@example.com" },
		userID: "work-user",
	});
	writeFileSync(path.join(PROFILE, ".credentials.json"), "{}");
}

beforeEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
	mkdirSync(HOME, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("provisionClaudeProfile", () => {
	it("shares every capability surface into the profile", async () => {
		seedDefaultAccount();
		seedProfile();

		const report = await provisionClaudeProfile(PROFILE, { homeDir: HOME });

		expect(report.surfaces["skills/"]).toBe("linked");
		expect(report.surfaces["plugins/"]).toBe("linked");
		expect(report.surfaces["agents/"]).toBe("linked");
		// The default account has none of these; nothing to share.
		expect(report.surfaces["commands/"]).toBe("absent");
		expect(lstatSync(path.join(PROFILE, "skills")).isSymbolicLink()).toBe(true);
		expect(
			readFileSync(
				path.join(PROFILE, "skills", "redesign", "SKILL.md"),
				"utf-8",
			),
		).toBe("# redesign");
		expect(readFileSync(path.join(PROFILE, "CLAUDE.md"), "utf-8")).toBe(
			"be brief",
		);
	});

	it("shares settings but never the login's own resolution", async () => {
		seedDefaultAccount();
		seedProfile();

		await provisionClaudeProfile(PROFILE, { homeDir: HOME });

		const settings = readJson(path.join(PROFILE, "settings.json"));
		expect(settings.model).toBe("claude-opus-5");
		expect(settings.effortLevel).toBe("high");
		expect(settings.enabledPlugins).toEqual({ "superset@superset": true });
		expect(settings.env).toEqual({ DISABLE_TELEMETRY: "1" });
		expect(settings.apiKeyHelper).toBeUndefined();
		// Hooks are provisioned per profile, not copied from the default's file.
		const hooks = settings.hooks as Record<string, unknown[]>;
		expect(JSON.stringify(hooks)).not.toContain("user-hook");
		expect(JSON.stringify(hooks)).toContain("notify.sh");
	});

	it("shares MCP servers and completes onboarding without touching identity", async () => {
		seedDefaultAccount();
		seedProfile();

		await provisionClaudeProfile(PROFILE, { homeDir: HOME });

		const state = readJson(path.join(PROFILE, ".claude.json"));
		expect(state.mcpServers).toEqual({ linear: { command: "linear-mcp" } });
		expect(state.theme).toBe("dark");
		expect(state.hasCompletedOnboarding).toBe(true);
		expect(state.oauthAccount).toEqual({ emailAddress: "work@example.com" });
		expect(state.userID).toBe("work-user");
		// Credentials are the one thing an account owns outright.
		expect(readFileSync(path.join(PROFILE, ".credentials.json"), "utf-8")).toBe(
			"{}",
		);
		expect(existsSync(path.join(DEFAULT_DIR, ".credentials.json"))).toBe(false);
	});

	it("skips the state merge until the profile has logged in", async () => {
		seedDefaultAccount();
		mkdirSync(PROFILE, { recursive: true });

		const report = await provisionClaudeProfile(PROFILE, { homeDir: HOME });

		expect(report.surfaces[".claude.json"]).toBe("absent");
		expect(existsSync(path.join(PROFILE, ".claude.json"))).toBe(false);
	});

	it("is idempotent", async () => {
		seedDefaultAccount();
		seedProfile();

		await provisionClaudeProfile(PROFILE, { homeDir: HOME });
		const second = await provisionClaudeProfile(PROFILE, { homeDir: HOME });

		expect(second.surfaces["skills/"]).toBe("unchanged");
		expect(second.surfaces["CLAUDE.md"]).toBe("unchanged");
		expect(second.surfaces["settings.json"]).toBe("unchanged");
		expect(second.surfaces[".claude.json"]).toBe("unchanged");
	});

	it("writes the bundled plugin into a skills dir the profile owns", async () => {
		seedDefaultAccount();
		seedProfile();
		mkdirSync(path.join(PROFILE, "skills", "mine"), { recursive: true });
		writeFileSync(path.join(PROFILE, "skills", "mine", "SKILL.md"), "# mine");

		const report = await provisionClaudeProfile(PROFILE, { homeDir: HOME });

		expect(report.surfaces["skills/"]).toBe("user-owned");
		expect(existsSync(path.join(PROFILE, "skills", "mine", "SKILL.md"))).toBe(
			true,
		);
		expect(existsSync(path.join(PROFILE, "skills", "superset", "skills"))).toBe(
			true,
		);
	});

	it("does nothing to the default account itself", async () => {
		seedDefaultAccount();

		const report = await provisionClaudeProfile(DEFAULT_DIR, { homeDir: HOME });

		expect(report.surfaces).toEqual({});
		expect(existsSync(path.join(DEFAULT_DIR, ".superset-profile.json"))).toBe(
			false,
		);
	});
});

describe("provisionCodexProfile", () => {
	const DEFAULT_CODEX = path.join(HOME, ".codex");
	const CODEX_PROFILE = path.join(HOME, ".codex-work");

	it("shares prompts, config, and instructions but not auth", async () => {
		mkdirSync(path.join(DEFAULT_CODEX, "prompts"), { recursive: true });
		writeFileSync(path.join(DEFAULT_CODEX, "prompts", "review.md"), "review");
		writeFileSync(
			path.join(DEFAULT_CODEX, "config.toml"),
			'model = "gpt-5"\n[mcp_servers.linear]\ncommand = "linear-mcp"\n',
		);
		writeFileSync(path.join(DEFAULT_CODEX, "AGENTS.md"), "be brief");
		writeFileSync(path.join(DEFAULT_CODEX, "auth.json"), '{"tokens":{}}');
		mkdirSync(CODEX_PROFILE, { recursive: true });

		const report = await provisionCodexProfile(CODEX_PROFILE, {
			homeDir: HOME,
		});

		expect(report.surfaces["prompts/"]).toBe("linked");
		expect(
			readFileSync(path.join(CODEX_PROFILE, "config.toml"), "utf-8"),
		).toContain("linear-mcp");
		expect(readFileSync(path.join(CODEX_PROFILE, "AGENTS.md"), "utf-8")).toBe(
			"be brief",
		);
		expect(existsSync(path.join(CODEX_PROFILE, "auth.json"))).toBe(false);
		expect(
			readFileSync(path.join(CODEX_PROFILE, "hooks.json"), "utf-8"),
		).toContain("notify.sh");
	});
});

describe("default homes are never provisioning targets", () => {
	it("refuses ~/.config/claude and the home dir itself", async () => {
		const configClaude = path.join(HOME, ".config", "claude");
		mkdirSync(configClaude, { recursive: true });
		for (const target of [configClaude, HOME, path.join(HOME, ".config")]) {
			const report = await provisionClaudeProfile(target, { homeDir: HOME });
			expect(report.surfaces).toEqual({});
		}
		expect(existsSync(path.join(configClaude, "skills"))).toBe(false);
		expect(existsSync(path.join(HOME, ".superset-profile.json"))).toBe(false);
	});
});
