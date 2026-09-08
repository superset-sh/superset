import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../../db";
import * as terminalEnv from "../../../../terminal/env";
import { initTerminalBaseEnv } from "../../../../terminal/env";
import * as accountDir from "../../usage/agent-account-dir";
import {
	resolveTrustFamily,
	seedAgentFolderTrust,
	seedClaudeFolderTrust,
	seedCodexFolderTrust,
} from "./seed-agent-trust";

let dir: string;

beforeEach(() => {
	initTerminalBaseEnv({});
	dir = mkdtempSync(join(tmpdir(), "seed-agent-trust-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("resolveTrustFamily", () => {
	test("matches by preset id", () => {
		expect(resolveTrustFamily({ presetId: "claude", command: "claude" })).toBe(
			"claude",
		);
		expect(resolveTrustFamily({ presetId: "codex", command: "codex" })).toBe(
			"codex",
		);
	});

	test("matches custom presets by launch executable", () => {
		expect(
			resolveTrustFamily({
				presetId: "custom-abc",
				command: "/usr/local/bin/claude --verbose",
			}),
		).toBe("claude");
		expect(
			resolveTrustFamily({
				presetId: "custom-def",
				command: "C:\\tools\\codex.exe",
			}),
		).toBe("codex");
	});

	test("returns null for providers without a known trust store", () => {
		expect(resolveTrustFamily({ presetId: "gemini", command: "gemini" })).toBe(
			null,
		);
		expect(
			resolveTrustFamily({ presetId: "custom-xyz", command: "my-agent" }),
		).toBe(null);
	});
});

describe("seedClaudeFolderTrust", () => {
	test("creates the state file with the trusted entry", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-a");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.projects["/tmp/session-a"].hasTrustDialogAccepted).toBe(true);
	});

	test("merges into existing state, preserving other keys", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(
			file,
			JSON.stringify({
				oauthAccount: { emailAddress: "x@y.z" },
				projects: {
					"/existing": { hasTrustDialogAccepted: true, allowedTools: ["Bash"] },
					"/tmp/session-b": { allowedTools: ["Edit"] },
				},
			}),
		);
		await seedClaudeFolderTrust(file, "/tmp/session-b");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.oauthAccount.emailAddress).toBe("x@y.z");
		expect(state.projects["/existing"].allowedTools).toEqual(["Bash"]);
		expect(state.projects["/tmp/session-b"]).toEqual({
			allowedTools: ["Edit"],
			hasTrustDialogAccepted: true,
		});
	});

	test("no-ops when the entry is already trusted", async () => {
		const file = join(dir, ".claude.json");
		const content = JSON.stringify({
			projects: { "/tmp/session-c": { hasTrustDialogAccepted: true } },
		});
		writeFileSync(file, content);
		await seedClaudeFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("leaves a corrupt state file alone rather than rewriting it", async () => {
		// updateClaudeStateFile starts an unparsable file from empty state, so
		// seeding through one would drop the identity block and every other
		// project's settings. A skipped seed costs one trust dialog; this
		// would cost the login.
		const file = join(dir, ".claude.json");
		writeFileSync(file, '{"oauthAccount":{"accountUuid":"u"},"projects":{');
		await seedClaudeFolderTrust(file, "/tmp/session-d");
		expect(readFileSync(file, "utf-8")).toBe(
			'{"oauthAccount":{"accountUuid":"u"},"projects":{',
		);
	});

	// A zero-byte file is what a touch, a truncated write, or a full disk
	// during someone else's write leaves behind. The writer treats it as empty
	// state, so refusing it here would strand every session on the dialog.
	test("seeds through an empty state file", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "");
		await seedClaudeFolderTrust(file, "/tmp/session-f");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.projects["/tmp/session-f"].hasTrustDialogAccepted).toBe(true);
	});

	test("seeds through a whitespace-only state file", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "  \n ");
		await seedClaudeFolderTrust(file, "/tmp/session-g");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.projects["/tmp/session-g"].hasTrustDialogAccepted).toBe(true);
	});

	test("leaves a state file holding a bare null alone", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "null");
		await seedClaudeFolderTrust(file, "/tmp/session-e");
		expect(readFileSync(file, "utf-8")).toBe("null");
	});

	test("skips when the config dir itself does not exist", async () => {
		const file = join(dir, "missing-profile", ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-e");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("preserves a tightened file mode across the rewrite", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{}");
		chmodSync(file, 0o600);
		await seedClaudeFolderTrust(file, "/tmp/session-f");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	test("creates a brand-new store owner-only", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-g");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});
});

describe("seedCodexFolderTrust", () => {
	test("creates config.toml with the trusted table", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-a");
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/session-a"]\ntrust_level = "trusted"\n',
		);
	});

	test("appends after existing content, preserving it", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n',
		);
		await seedCodexFolderTrust(file, "/tmp/session-b");
		expect(readFileSync(file, "utf-8")).toBe(
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/tmp/session-b"]\ntrust_level = "trusted"\n',
		);
	});

	test("leaves an existing table for the path untouched", async () => {
		const file = join(dir, "config.toml");
		const content = '[projects."/tmp/session-c"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("escapes quotes and backslashes in the path key", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "trusted"\n',
		);
	});

	test("skips when the codex home does not exist", async () => {
		const file = join(dir, "missing-home", "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-d");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("detects an equivalent header with different spacing", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[ projects . "/tmp/session-e" ]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-e");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a literal-string header", async () => {
		const file = join(dir, "config.toml");
		const content =
			"[projects.'/tmp/session-f']\ntrust_level = \"untrusted\"\n";
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-f");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a top-level dotted key", async () => {
		const file = join(dir, "config.toml");
		const content = 'projects."/tmp/session-g".trust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-g");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("matches an escaped header against the raw path", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("still appends when only a different path is defined", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(file, '[ projects . "/other" ]\ntrust_level = "trusted"\n');
		await seedCodexFolderTrust(file, "/tmp/session-h");
		expect(readFileSync(file, "utf-8")).toContain(
			'[projects."/tmp/session-h"]\ntrust_level = "trusted"\n',
		);
	});
});

/**
 * KTD12: a config dir the user pinned themselves is Superset's to read, never
 * to write. The trust seeder resolves the same dir a launch would, so it is
 * also the place that would write into one.
 */
describe("seedAgentFolderTrust", () => {
	function mockDb(claudeConfigDir: string | null): HostDb {
		return {
			select: () => ({
				from: () => ({
					get: () => ({
						defaultClaudeConfigDir: claudeConfigDir,
						defaultCodexHome: null,
					}),
				}),
			}),
		} as unknown as HostDb;
	}

	const previousSupersetHome = process.env.SUPERSET_HOME_DIR;
	let selected: string;
	let pinned: string;
	let folder: string;

	beforeEach(() => {
		process.env.SUPERSET_HOME_DIR = join(dir, "superset");
		selected = join(dir, "selected-profile");
		pinned = join(dir, "hand-exported");
		folder = join(dir, "session");
		for (const path of [selected, pinned, folder]) {
			mkdirSync(path, { recursive: true });
		}
	});

	afterEach(() => {
		if (previousSupersetHome === undefined)
			delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousSupersetHome;
	});

	const claudeConfig = (env: Record<string, string>) => ({
		presetId: "claude",
		command: "claude",
		env,
	});

	test("waits for the cold-start shell snapshot before seeding", async () => {
		terminalEnv.resetTerminalBaseEnvForTests();
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		const wait = spyOn(
			terminalEnv,
			"waitForTerminalBaseEnv",
		).mockImplementation(async () => {
			await ready;
			initTerminalBaseEnv({});
		});
		const seeding = seedAgentFolderTrust(
			mockDb(selected),
			folder,
			claudeConfig({}),
		);
		try {
			expect(wait).toHaveBeenCalledTimes(1);
			expect(existsSync(join(selected, ".claude.json"))).toBe(false);
			release();
			await seeding;
			expect(
				JSON.parse(readFileSync(join(selected, ".claude.json"), "utf8"))
					.projects[realpathSync(folder)].hasTrustDialogAccepted,
			).toBe(true);
		} finally {
			release();
			await seeding;
			wait.mockRestore();
			initTerminalBaseEnv({});
		}
	});

	test("passes the shell snapshot to classification and leaves its foreign dir untouched", async () => {
		initTerminalBaseEnv({ CLAUDE_CONFIG_DIR: pinned });
		const classify = spyOn(
			accountDir,
			"resolveAgentAccountDir",
		).mockReturnValue({
			configDir: pinned,
			managed: false,
		});
		try {
			await seedAgentFolderTrust(mockDb(null), folder, claudeConfig({}));
			expect(classify).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					shellEnv: { CLAUDE_CONFIG_DIR: pinned },
				}),
			);
			expect(existsSync(join(pinned, ".claude.json"))).toBe(false);
		} finally {
			classify.mockRestore();
			initTerminalBaseEnv({});
		}
	});

	test("seeds the Superset-selected config dir", async () => {
		await seedAgentFolderTrust(mockDb(selected), folder, claudeConfig({}));

		const state = JSON.parse(
			readFileSync(join(selected, ".claude.json"), "utf-8"),
		);
		expect(state.projects[realpathSync(folder)].hasTrustDialogAccepted).toBe(
			true,
		);
	});

	test("never writes into a config dir the user pinned", async () => {
		await seedAgentFolderTrust(
			mockDb(selected),
			folder,
			claudeConfig({ CLAUDE_CONFIG_DIR: pinned }),
		);

		expect(existsSync(join(pinned, ".claude.json"))).toBe(false);
		expect(existsSync(join(selected, ".claude.json"))).toBe(false);
	});

	// A pin that names Superset's own selection is where the launch runs, and
	// it is the same file an unpinned launch is seeded into — so refusing it
	// only cost the user the trust dialog on every new session. `managed` says
	// no here because it answers a different question: whether the ENGINE may
	// restart the session onto another account.
	test("seeds a pin that names the dir Superset selected", async () => {
		await seedAgentFolderTrust(
			mockDb(selected),
			folder,
			claudeConfig({ CLAUDE_CONFIG_DIR: selected }),
		);

		const state = JSON.parse(
			readFileSync(join(selected, ".claude.json"), "utf-8"),
		);
		expect(state.projects[realpathSync(folder)].hasTrustDialogAccepted).toBe(
			true,
		);
	});

	// The twin is read from the DB-derived default env, never the merged one.
	// A config that supplies its own SUPERSET_DEFAULT_* beside a foreign dir
	// would otherwise forge the equality above and induce a host-service write
	// into a directory nobody handed us.
	test("refuses a pin that forges the Superset twin", async () => {
		await seedAgentFolderTrust(
			mockDb(selected),
			folder,
			claudeConfig({
				CLAUDE_CONFIG_DIR: pinned,
				SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: pinned,
			}),
		);

		expect(existsSync(join(pinned, ".claude.json"))).toBe(false);
		expect(existsSync(join(selected, ".claude.json"))).toBe(false);
	});
});
