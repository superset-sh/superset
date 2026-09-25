import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildNamingShellInvocation,
	generateWorkspaceNamesFromPrompt,
	resolveGeneratedBranchName,
} from "./ai-workspace-names";

describe("generateWorkspaceNamesFromPrompt", () => {
	test("derives names from the prompt when no agent context is supplied", async () => {
		await expect(
			generateWorkspaceNamesFromPrompt("  Fix the login   redirect loop! "),
		).resolves.toEqual({
			names: {
				title: "Fix the login redirect loop",
				branchName: "fix-the-login-redirect-loop",
			},
			source: "prompt",
			warning: undefined,
		});
	});

	test("returns null for a blank prompt", async () => {
		await expect(generateWorkspaceNamesFromPrompt("   ")).resolves.toBeNull();
	});

	test("caps the derived branch slug at 30 characters", async () => {
		const result = await generateWorkspaceNamesFromPrompt(
			"rewrite the entire authentication and authorization subsystem",
		);
		expect(result?.names.branchName).toBe("rewrite-the-entire-authenticat");
		expect(result?.names.branchName.length).toBeLessThanOrEqual(30);
	});

	test("keeps the full title when the branch slug truncates it", async () => {
		const result = await generateWorkspaceNamesFromPrompt(
			"rewrite the entire authentication and authorization subsystem",
		);
		expect(result?.names.title).toBe(
			"rewrite the entire authentication and authorization subsystem",
		);
	});

	// Naming instructions are a prompt for the agent CLI; the derived
	// fallback has no model to give them to and ignores them.
	test("still derives names when the project sets naming instructions", async () => {
		await expect(
			generateWorkspaceNamesFromPrompt(
				"fix the login redirect",
				undefined,
				"Prefix branches with fix/ and include the ticket id.",
			),
		).resolves.toEqual({
			names: {
				title: "fix the login redirect",
				branchName: "fix-the-login-redirect",
			},
			source: "prompt",
			warning: undefined,
		});
	});
});

describe("buildNamingShellInvocation", () => {
	test("runs the command through the terminal's command-shell args", () => {
		const invocation = buildNamingShellInvocation({
			command: "claude -p 'name this'",
			baseEnv: { HOME: "/home/me", PATH: "/usr/bin" },
			shell: "/bin/zsh",
		});
		expect(invocation.shell).toBe("/bin/zsh");
		expect(invocation.args[0]).toBe("-lc");
		expect(invocation.args[1]).toContain("claude -p 'name this'");
	});

	test("builds the env from the base snapshot, not the host process env", () => {
		process.env.SUPERSET_NAMING_TEST_LEAK = "leaked";
		try {
			const invocation = buildNamingShellInvocation({
				command: "true",
				baseEnv: { HOME: "/home/me", PATH: "/usr/bin" },
				shell: "/bin/zsh",
			});
			expect(invocation.env).toEqual({ HOME: "/home/me", PATH: "/usr/bin" });
		} finally {
			delete process.env.SUPERSET_NAMING_TEST_LEAK;
		}
	});

	test("strips provider API keys so the CLI names with its own login", () => {
		const invocation = buildNamingShellInvocation({
			command: "true",
			baseEnv: {
				PATH: "/usr/bin",
				ANTHROPIC_API_KEY: "sk-ant",
				OPENAI_API_KEY: "sk-oai",
			},
			shell: "/bin/zsh",
		});
		expect(invocation.env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
		expect(invocation.env.PATH).toBe("/usr/bin");
	});

	test("overlays the default-account env on the base snapshot", () => {
		const invocation = buildNamingShellInvocation({
			command: "true",
			baseEnv: { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/stale" },
			accountEnv: { CLAUDE_CONFIG_DIR: "/home/me/.claude-work" },
			shell: "/bin/zsh",
		});
		expect(invocation.env.CLAUDE_CONFIG_DIR).toBe("/home/me/.claude-work");
	});
});

// A zsh login shell run with `-lc` reads .zshenv and .zprofile but never
// .zshrc, which is where Claude Code's native installer puts ~/.local/bin on
// PATH (#7398). The invocation must find a binary that is only on the
// .zshrc PATH, the way every Superset terminal does.
const zshAvailable = existsSync("/bin/zsh");
describe.skipIf(!zshAvailable)(
	"buildNamingShellInvocation under a real zsh",
	() => {
		let root: string;
		let home: string;
		let bin: string;
		const savedSupersetHome = process.env.SUPERSET_HOME_DIR;

		beforeEach(() => {
			root = mkdtempSync(join(tmpdir(), "superset-naming-"));
			home = join(root, "home");
			bin = join(root, "rc-only-bin");
			mkdirSync(home, { recursive: true });
			mkdirSync(bin, { recursive: true });
			writeFileSync(join(bin, "claude"), "#!/bin/sh\necho hi\n", {
				mode: 0o755,
			});
			writeFileSync(join(home, ".zshrc"), `export PATH="${bin}:$PATH"\n`);
			// Stand-in for the zsh wrapper agent-setup writes at boot; the real
			// one sources the user's .zshrc through SUPERSET_ORIG_ZDOTDIR (which
			// defaults to $HOME) exactly like this.
			const supersetHome = join(root, "superset-home");
			mkdirSync(join(supersetHome, "zsh"), { recursive: true });
			writeFileSync(
				join(supersetHome, "zsh", ".zshrc"),
				'[[ -f "$HOME/.zshrc" ]] && source "$HOME/.zshrc"\n',
			);
			process.env.SUPERSET_HOME_DIR = supersetHome;
		});

		afterEach(() => {
			if (savedSupersetHome === undefined) {
				delete process.env.SUPERSET_HOME_DIR;
			} else {
				process.env.SUPERSET_HOME_DIR = savedSupersetHome;
			}
			rmSync(root, { recursive: true, force: true });
		});

		function runZsh(args: string[], env: Record<string, string>): string {
			return spawnSync("/bin/zsh", args, {
				env,
				encoding: "utf8",
			}).stdout.trim();
		}

		test("finds a binary that is only on the .zshrc PATH", () => {
			const baseEnv = { HOME: home, PATH: "/usr/bin:/bin" };
			// The pre-fix invocation, for contrast: a bare login shell.
			expect(runZsh(["-lc", "whence -p claude"], baseEnv)).toBe("");

			const invocation = buildNamingShellInvocation({
				command: "whence -p claude",
				baseEnv,
				shell: "/bin/zsh",
			});
			expect(runZsh(invocation.args, invocation.env)).toBe(join(bin, "claude"));
		});
	},
);

describe("resolveGeneratedBranchName", () => {
	test("reapplies the project's branch prefix onto the AI's bare candidate", () => {
		expect(
			resolveGeneratedBranchName({
				candidate: "fix-login-timeout",
				branchPrefix: "kiet",
				oldBranchName: "kiet/quick-brown-fox",
			}),
		).toEqual({
			prefixedCandidate: "kiet/fix-login-timeout",
			changed: true,
		});
	});

	test("passes the candidate through unprefixed when there's no configured prefix", () => {
		expect(
			resolveGeneratedBranchName({
				candidate: "fix-login-timeout",
				branchPrefix: undefined,
				oldBranchName: "quick-brown-fox",
			}),
		).toEqual({
			prefixedCandidate: "fix-login-timeout",
			changed: true,
		});
	});

	test("reports no change when the prefixed candidate matches the current branch", () => {
		expect(
			resolveGeneratedBranchName({
				candidate: "fix-login-timeout",
				branchPrefix: "kiet",
				oldBranchName: "kiet/fix-login-timeout",
			}),
		).toEqual({
			prefixedCandidate: "kiet/fix-login-timeout",
			changed: false,
		});
	});

	test("reports no change for an empty candidate, even with a prefix", () => {
		expect(
			resolveGeneratedBranchName({
				candidate: "",
				branchPrefix: "kiet",
				oldBranchName: "kiet/quick-brown-fox",
			}),
		).toEqual({
			prefixedCandidate: "kiet/",
			changed: false,
		});
	});
});
