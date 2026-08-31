import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { setDefaultAccountSelection } from "../usage/default-account";
import {
	buildAgentCommandString,
	buildTerminalAgentLaunch,
	validateAgentEffortSelection,
	validateAgentForkSelection,
	validateAgentModelSelection,
	validateAgentModeSelection,
	validateAgentResumeSelection,
} from "./agents";

const argvConfig = {
	id: "00000000-0000-0000-0000-000000000001",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: ["--dangerously-skip-permissions"],
	promptTransport: "argv" as const,
	promptArgs: [],
	resumeArgs: ["--resume"],
	forkArgs: ["--resume", "{sessionId}", "--fork-session"],
	env: {},
};

const stdinConfig = {
	id: "00000000-0000-0000-0000-000000000002",
	presetId: "amp",
	label: "Amp",
	command: "amp",
	args: [],
	promptTransport: "stdin" as const,
	promptArgs: [],
	resumeArgs: ["threads", "continue"],
	forkArgs: [],
	env: {},
};

const RANDOM_ID = "test-1234";
const DELIMITER = "SUPERSET_PROMPT_test1234";

describe("buildAgentCommandString", () => {
	it("appends the prompt as a quoted positional (argv transport)", () => {
		// Not the shared "$(cat <<…)" form: the command must parse in non-POSIX
		// shells like fish, which have no heredocs.
		expect(
			buildAgentCommandString(argvConfig, "do the thing", [], {
				randomId: RANDOM_ID,
			}),
		).toBe("'claude' '--dangerously-skip-permissions' 'do the thing'");
	});

	it("inserts model args between base args and the prompt (argv transport)", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"do the thing",
				["--model", "sonnet"],
				{
					randomId: RANDOM_ID,
				},
			),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'sonnet' 'do the thing'",
		);
	});

	it("inserts model args before the heredoc (stdin transport)", () => {
		expect(
			buildAgentCommandString(
				stdinConfig,
				"do the thing",
				["--model", "sonnet"],
				{
					randomId: RANDOM_ID,
				},
			),
		).toBe(
			`'amp' '--model' 'sonnet' <<'${DELIMITER}'\ndo the thing\n${DELIMITER}`,
		);
	});

	it("shell-quotes hostile model and prompt values", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"p'; rm -rf /",
				["--model", "x'; rm -rf /"],
				{
					randomId: RANDOM_ID,
				},
			),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'x'\\''; rm -rf /' 'p'\\''; rm -rf /'",
		);
	});

	it("includes promptArgs before the prompt when a prompt is present", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(
			buildAgentCommandString(config, "p", [], { randomId: RANDOM_ID }),
		).toBe("'claude' '--dangerously-skip-permissions' '-p' 'p'");
	});

	it("drops promptArgs and the prompt payload when the prompt sanitizes to empty", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(
			buildAgentCommandString(config, "\x1b\x07", [], { randomId: RANDOM_ID }),
		).toBe("'claude' '--dangerously-skip-permissions'");
		expect(
			buildAgentCommandString(stdinConfig, "", [], { randomId: RANDOM_ID }),
		).toBe("'amp'");
	});

	it("splices resumeArgs and the session id after the base args (promptless resume)", () => {
		expect(
			buildAgentCommandString(argvConfig, "", [], {
				resumeSessionId: "abc-123",
				randomId: RANDOM_ID,
			}),
		).toBe("'claude' '--dangerously-skip-permissions' '--resume' 'abc-123'");
	});

	it("keeps the prompt after the resume args (argv transport)", () => {
		expect(
			buildAgentCommandString(argvConfig, "keep going", ["--model", "sonnet"], {
				resumeSessionId: "abc-123",
				randomId: RANDOM_ID,
			}),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'sonnet' '--resume' 'abc-123' 'keep going'",
		);
	});

	it("supports subcommand-style resume args (stdin transport)", () => {
		expect(
			buildAgentCommandString(stdinConfig, "keep going", [], {
				resumeSessionId: "T-42",
				randomId: RANDOM_ID,
			}),
		).toBe(
			`'amp' 'threads' 'continue' 'T-42' <<'${DELIMITER}'\nkeep going\n${DELIMITER}`,
		);
	});

	it("shell-quotes and sanitizes a hostile resume session id", () => {
		expect(
			buildAgentCommandString(argvConfig, "", [], {
				resumeSessionId: "x'; rm -rf /\x1b",
				randomId: RANDOM_ID,
			}),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--resume' 'x'\\''; rm -rf /'",
		);
	});

	it("uses placeholder-based native fork args", () => {
		expect(
			buildAgentCommandString(argvConfig, "", [], {
				forkSessionId: "abc-123",
				randomId: RANDOM_ID,
			}),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--resume' 'abc-123' '--fork-session'",
		);
	});

	it("appends a session id when native fork args omit a placeholder", () => {
		const config = { ...argvConfig, command: "codex", forkArgs: ["fork"] };
		expect(
			buildAgentCommandString(config, "continue", [], {
				forkSessionId: "thread-42",
				randomId: RANDOM_ID,
			}),
		).toBe(
			"'codex' '--dangerously-skip-permissions' 'fork' 'thread-42' 'continue'",
		);
	});
});

describe("validateAgentResumeSelection", () => {
	it("accepts an omitted resume", () => {
		expect(() =>
			validateAgentResumeSelection(argvConfig, undefined),
		).not.toThrow();
	});

	it("accepts a session id when the config has resume args", () => {
		expect(() =>
			validateAgentResumeSelection(argvConfig, "abc-123"),
		).not.toThrow();
	});

	it("rejects resuming a config without resume args", () => {
		const config = { ...argvConfig, resumeArgs: [] };
		try {
			validateAgentResumeSelection(config, "abc-123");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				"Claude does not support resuming a session by id. Omit resumeSessionId to start a new session.",
			);
		}
	});

	it("rejects a session id that sanitizes to empty", () => {
		try {
			validateAgentResumeSelection(argvConfig, "\x1b\x07");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				"Invalid resume session id for Claude.",
			);
		}
	});
});

describe("validateAgentForkSelection", () => {
	it("accepts a native fork id when the config has fork args", () => {
		expect(() =>
			validateAgentForkSelection(argvConfig, "abc-123"),
		).not.toThrow();
	});

	it("rejects forking a config without fork args", () => {
		try {
			validateAgentForkSelection({ ...argvConfig, forkArgs: [] }, "abc-123");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				"Claude does not support forking a session by id. Omit forkSessionId to start a new session.",
			);
		}
	});
});

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

describe("buildTerminalAgentLaunch", () => {
	function seedConfig(db: ReturnType<typeof createTestDb>) {
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000a",
				presetId: "claude",
				label: "Claude",
				command: "claude",
				argsJson: JSON.stringify(["--dangerously-skip-permissions"]),
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: JSON.stringify(["--resume"]),
				forkArgsJson: JSON.stringify([
					"--resume",
					"{sessionId}",
					"--fork-session",
				]),
				envJson: JSON.stringify({ FOO: "bar" }),
				displayOrder: 0,
			})
			.run();
	}

	it("resolves the agent config to a runnable command without a terminal", () => {
		const db = createTestDb();
		seedConfig(db);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "do the thing",
		});
		expect(launch.label).toBe("Claude");
		expect(launch.fullCommand).toBe(
			"FOO='bar' 'claude' '--dangerously-skip-permissions' 'do the thing'",
		);
	});

	it("resumes a previous session with an empty prompt", () => {
		const db = createTestDb();
		seedConfig(db);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "",
			resumeSessionId: "abc-123",
		});
		expect(launch.fullCommand).toBe(
			"FOO='bar' 'claude' '--dangerously-skip-permissions' '--resume' 'abc-123'",
		);
	});

	it("forks a previous provider session without changing the source", () => {
		const db = createTestDb();
		seedConfig(db);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "",
			forkSessionId: "session-source",
		});
		expect(launch.fullCommand).toContain(
			"'--resume' 'session-source' '--fork-session'",
		);
	});

	it("rejects combining resume and fork", () => {
		const db = createTestDb();
		seedConfig(db);
		expect(() =>
			buildTerminalAgentLaunch(db, {
				workspaceId: "11111111-1111-1111-1111-111111111111",
				agent: "claude",
				prompt: "",
				resumeSessionId: "session-source",
				forkSessionId: "session-source",
			}),
		).toThrow("Choose either resumeSessionId or forkSessionId, not both.");
	});

	it("refuses a fork of a session the harness no longer has", () => {
		const db = createTestDb();
		seedConfig(db);
		// A refusal is only justified when the harness's project directory is
		// visible and holds no such session, so the fixture has to provide one.
		// Pinning the agent to a temp CLAUDE_CONFIG_DIR keeps it out of ~/.claude.
		const configDir = mkdtempSync(join(tmpdir(), "fork-preflight-"));
		const worktreePath = mkdtempSync(join(tmpdir(), "fork-worktree-"));
		mkdirSync(
			join(configDir, "projects", worktreePath.replaceAll(/[/.]/g, "-")),
			{ recursive: true },
		);
		db.insert(schema.workspaces)
			.values({
				id: "11111111-1111-1111-1111-111111111111",
				worktreePath,
				branch: "main",
				name: "fixture",
			})
			.run();
		db.update(schema.hostAgentConfigs)
			.set({ envJson: JSON.stringify({ CLAUDE_CONFIG_DIR: configDir }) })
			.where(eq(schema.hostAgentConfigs.presetId, "claude"))
			.run();
		// The claude locator reads ~/.claude/projects/<encoded cwd>/<id>.jsonl,
		// and this workspace has no such file, so the answer is a confident no.
		expect(() =>
			buildTerminalAgentLaunch(db, {
				workspaceId: "11111111-1111-1111-1111-111111111111",
				agent: "claude",
				prompt: "",
				forkSessionId: "99999999-9999-4999-8999-999999999999",
			}),
		).toThrow(/no longer has session/);
	});

	it("still forks when the harness keeps sessions somewhere we cannot read", () => {
		const db = createTestDb();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000d",
				presetId: "grok",
				label: "Grok",
				command: "grok",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: JSON.stringify(["--resume"]),
				forkArgsJson: JSON.stringify([
					"--resume",
					"{sessionId}",
					"--fork-session",
				]),
				envJson: "{}",
				displayOrder: 3,
			})
			.run();
		// Server-side sessions answer "unknown"; unknown must not block.
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "grok",
			prompt: "",
			forkSessionId: "99999999-9999-4999-8999-999999999999",
		});
		expect(launch.fullCommand).toContain("--fork-session");
	});

	it("names the conflict even when the agent cannot fork at all", () => {
		const db = createTestDb();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000c",
				presetId: "no-fork",
				label: "No Fork",
				command: "no-fork",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: JSON.stringify(["--resume"]),
				envJson: "{}",
				displayOrder: 2,
			})
			.run();
		expect(() =>
			buildTerminalAgentLaunch(db, {
				workspaceId: "11111111-1111-1111-1111-111111111111",
				agent: "no-fork",
				prompt: "",
				resumeSessionId: "session-source",
				forkSessionId: "session-source",
			}),
		).toThrow("Choose either resumeSessionId or forkSessionId, not both.");
	});

	it("rejects a resume when the agent config has no resume args", () => {
		const db = createTestDb();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000b",
				presetId: "custom",
				label: "My Agent",
				command: "my-agent",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				envJson: "{}",
				displayOrder: 1,
			})
			.run();
		expect(() =>
			buildTerminalAgentLaunch(db, {
				workspaceId: "11111111-1111-1111-1111-111111111111",
				agent: "custom",
				prompt: "",
				resumeSessionId: "abc-123",
			}),
		).toThrow(/does not support resuming a session by id/);
	});

	it("builds OMP model, effort, and plan-mode arguments", () => {
		const db = createTestDb();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000c",
				presetId: "pi",
				label: "Oh My Pi",
				command: "omp",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: JSON.stringify(["--resume"]),
				envJson: "{}",
				displayOrder: 2,
			})
			.run();

		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "pi",
			prompt: "do the thing",
			model: "@plan",
			effort: "high",
			mode: "plan",
		});

		expect(launch.fullCommand).toBe(
			"'omp' '--model' '@plan' '--thinking' 'high' '--plan-yolo' 'do the thing'",
		);
	});

	it("rejects a stale model instead of launching on the agent default", () => {
		const db = createTestDb();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000d",
				presetId: "claude",
				label: "Claude",
				command: "claude",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				resumeArgsJson: "[]",
				envJson: "{}",
				displayOrder: 3,
			})
			.run();

		expect(() =>
			buildTerminalAgentLaunch(db, {
				workspaceId: "11111111-1111-1111-1111-111111111111",
				agent: "claude",
				prompt: "do the thing",
				model: "claude-opus-9",
			}),
		).toThrow(/Unsupported model "claude-opus-9" for Claude/);
	});

	it("throws NOT_FOUND for an unknown agent", () => {
		const db = createTestDb();
		expect(() =>
			buildTerminalAgentLaunch(db, {
				workspaceId: "11111111-1111-1111-1111-111111111111",
				agent: "nope",
				prompt: "p",
			}),
		).toThrow(/No host agent config matching 'nope'/);
	});
});

describe("buildTerminalAgentLaunch default account env", () => {
	// tmpdir always exists, which is all resolveDefaultAccountEnv checks.
	const existingDir = tmpdir();

	function seedClaude(db: HostDb, env: Record<string, string> = {}) {
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000c",
				presetId: "claude",
				label: "Claude",
				command: "claude",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				envJson: JSON.stringify(env),
				displayOrder: 0,
			})
			.run();
	}

	it("injects CLAUDE_CONFIG_DIR for claude agents when a default account is set", () => {
		const db = createTestDb();
		seedClaude(db);
		setDefaultAccountSelection(db, "claude", existingDir);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "hi",
		});
		expect(launch.fullCommand).toBe(
			`CLAUDE_CONFIG_DIR='${existingDir}' SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR='${existingDir}' 'claude' 'hi'`,
		);
	});

	it("lets a per-agent CLAUDE_CONFIG_DIR beat the host default", () => {
		const db = createTestDb();
		seedClaude(db, { CLAUDE_CONFIG_DIR: "/pinned/profile" });
		setDefaultAccountSelection(db, "claude", existingDir);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "hi",
		});
		// The per-agent value wins for CLAUDE_CONFIG_DIR; the SUPERSET_DEFAULT_*
		// twin still carries the host default so the wrapper can re-resolve a
		// later account switch without overriding the user-pinned value.
		expect(launch.fullCommand).toBe(
			`CLAUDE_CONFIG_DIR='/pinned/profile' SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR='${existingDir}' 'claude' 'hi'`,
		);
	});

	it("skips injection when the selected profile dir no longer exists", () => {
		const db = createTestDb();
		seedClaude(db);
		setDefaultAccountSelection(db, "claude", "/no/such/profile-dir");
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "hi",
		});
		expect(launch.fullCommand).toBe("'claude' 'hi'");
	});

	it("does not leak provider account env into other presets", () => {
		const db = createTestDb();
		db.insert(schema.hostAgentConfigs)
			.values({
				id: "00000000-0000-0000-0000-00000000000d",
				presetId: "amp",
				label: "Amp",
				command: "amp",
				argsJson: "[]",
				promptTransport: "argv",
				promptArgsJson: "[]",
				envJson: "{}",
				displayOrder: 0,
			})
			.run();
		setDefaultAccountSelection(db, "claude", existingDir);
		setDefaultAccountSelection(db, "codex", existingDir);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "amp",
			prompt: "hi",
		});
		expect(launch.fullCommand).toBe("'amp' 'hi'");
	});

	it("clearing the default (null) restores the system login", () => {
		const db = createTestDb();
		seedClaude(db);
		setDefaultAccountSelection(db, "claude", existingDir);
		setDefaultAccountSelection(db, "claude", null);
		const launch = buildTerminalAgentLaunch(db, {
			workspaceId: "11111111-1111-1111-1111-111111111111",
			agent: "claude",
			prompt: "hi",
		});
		expect(launch.fullCommand).toBe("'claude' 'hi'");
	});
});

describe("validateAgentModelSelection", () => {
	it("leaves the model unset so the agent can use its own default", () => {
		expect(() =>
			validateAgentModelSelection("claude", "Claude", undefined),
		).not.toThrow();
	});

	it("accepts a pinned legacy model for the selected agent", () => {
		expect(() =>
			validateAgentModelSelection("claude", "Claude", "claude-opus-4-8"),
		).not.toThrow();
	});

	it("rejects an unknown model instead of silently dropping the flag", () => {
		try {
			validateAgentModelSelection("claude", "Claude", "claude-opus-9");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toContain(
				'Unsupported model "claude-opus-9" for Claude. Choose one of: ',
			);
			expect((error as Error).message).toContain("claude-opus-4-8");
		}
	});

	it("rejects overrides for agents without model support", () => {
		try {
			validateAgentModelSelection("superset", "Superset", "claude-opus-5");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				"Superset does not support a model override. Omit model to use the agent default.",
			);
		}
	});
});

describe("validateAgentEffortSelection", () => {
	it("leaves the effort unset so the agent can use its own default", () => {
		expect(() =>
			validateAgentEffortSelection("codex", "Codex", undefined),
		).not.toThrow();
	});

	it("accepts a supported effort for the selected agent", () => {
		expect(() =>
			validateAgentEffortSelection("codex", "Codex", "xhigh"),
		).not.toThrow();
	});

	it("rejects an invalid effort with the supported values", () => {
		try {
			validateAgentEffortSelection("codex", "Codex", "extreme");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				'Unsupported reasoning effort "extreme" for Codex. Choose one of: low, medium, high, xhigh, max, ultra.',
			);
		}
	});

	it("rejects an effort the selected model does not accept", () => {
		expect(() =>
			validateAgentEffortSelection("codex", "Codex", "ultra", "gpt-5.6-sol"),
		).not.toThrow();
		try {
			validateAgentEffortSelection("codex", "Codex", "ultra", "gpt-5.5");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect((error as Error).message).toBe(
				'Unsupported reasoning effort "ultra" for Codex with model gpt-5.5. Choose one of: low, medium, high, xhigh.',
			);
		}
	});

	it("rejects overrides for agents without effort support", () => {
		try {
			validateAgentEffortSelection("superset", "Superset", "high");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				"Superset does not support a reasoning effort override. Omit effort to use the agent default.",
			);
		}
	});
});

describe("validateAgentModeSelection", () => {
	it("leaves the mode unset so the agent can use its own default", () => {
		expect(() =>
			validateAgentModeSelection("omp", "Oh My Pi", undefined),
		).not.toThrow();
	});

	it("accepts OMP plan mode", () => {
		expect(() =>
			validateAgentModeSelection("omp", "Oh My Pi", "plan"),
		).not.toThrow();
	});

	it("rejects unsupported launch modes", () => {
		expect(() =>
			validateAgentModeSelection("omp", "Oh My Pi", "review"),
		).toThrow('Unsupported launch mode "review" for Oh My Pi');
		expect(() => validateAgentModeSelection("pi", "Pi", "plan")).toThrow(
			"Pi does not support a launch mode override",
		);
		expect(() =>
			validateAgentModeSelection("claude", "Claude", "plan"),
		).toThrow("Claude does not support a launch mode override");
	});
});
