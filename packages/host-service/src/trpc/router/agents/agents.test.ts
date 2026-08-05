import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import {
	buildAgentCommandString,
	buildTerminalAgentLaunch,
	isChatAgent,
	validateAgentEffortSelection,
} from "./agents";

const argvConfig = {
	id: "00000000-0000-0000-0000-000000000001",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: ["--dangerously-skip-permissions"],
	promptTransport: "argv" as const,
	promptArgs: [],
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
	env: {},
};

const RANDOM_ID = "test-1234";
const DELIMITER = "SUPERSET_PROMPT_test1234";

describe("buildAgentCommandString", () => {
	it("appends the prompt as a quoted positional (argv transport)", () => {
		// Not the shared "$(cat <<…)" form: the command must parse in non-POSIX
		// shells like fish, which have no heredocs.
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "do the thing",
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe("'claude' '--dangerously-skip-permissions' 'do the thing'");
	});

	it("inserts model args between base args and the prompt (argv transport)", () => {
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "do the thing",
				modelArgs: ["--model", "sonnet"],
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'sonnet' 'do the thing'",
		);
	});

	it("inserts model args before the heredoc (stdin transport)", () => {
		expect(
			buildAgentCommandString({
				config: stdinConfig,
				rawPrompt: "do the thing",
				modelArgs: ["--model", "sonnet"],
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe(
			`'amp' '--model' 'sonnet' <<'${DELIMITER}'\ndo the thing\n${DELIMITER}`,
		);
	});

	it("shell-quotes hostile model and prompt values", () => {
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "p'; rm -rf /",
				modelArgs: ["--model", "x'; rm -rf /"],
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'x'\\''; rm -rf /' 'p'\\''; rm -rf /'",
		);
	});

	it("includes promptArgs before the prompt when a prompt is present", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(
			buildAgentCommandString({
				config,
				rawPrompt: "p",
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe("'claude' '--dangerously-skip-permissions' '-p' 'p'");
	});

	it("drops promptArgs and the prompt payload when the prompt sanitizes to empty", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(
			buildAgentCommandString({
				config,
				rawPrompt: "\x1b\x07",
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe("'claude' '--dangerously-skip-permissions'");
		expect(
			buildAgentCommandString({
				config: stdinConfig,
				rawPrompt: "",
				randomId: RANDOM_ID,
				shellFamily: "posix",
			}),
		).toBe("'amp'");
	});

	it("emits nu syntax with an unquoted command name (argv transport)", () => {
		// nu parses a quoted string in command position as a string literal,
		// not a command, so the POSIX form fails with nu::parser::parse_mismatch.
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "do the thing",
				randomId: RANDOM_ID,
				shellFamily: "nu",
			}),
		).toBe('^"claude" "--dangerously-skip-permissions" "do the thing"');
	});

	it("pipes the prompt into the agent under nu (stdin transport)", () => {
		// nu has no heredocs; a string piped to an external command becomes its
		// stdin.
		expect(
			buildAgentCommandString({
				config: stdinConfig,
				rawPrompt: "do the thing",
				randomId: RANDOM_ID,
				shellFamily: "nu",
			}),
		).toBe('"do the thing" | ^"amp"');
	});

	it("escapes backslashes and double quotes for nu", () => {
		// nu honors backslash escapes inside double quotes, so an unescaped
		// literal `\n` in a prompt would reach the agent as a newline. Single
		// quotes can't be used instead: nu's are fully literal, so a prompt
		// containing `'` would have no representation at all.
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: 'say "hi" \\n and it\'s fine',
				randomId: RANDOM_ID,
				shellFamily: "nu",
			}),
		).toBe(
			'^"claude" "--dangerously-skip-permissions" "say \\"hi\\" \\\\n and it\'s fine"',
		);
	});

	it("keeps promptless nu launches parseable", () => {
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "",
				randomId: RANDOM_ID,
				shellFamily: "nu",
			}),
		).toBe('^"claude" "--dangerously-skip-permissions"');
	});

	it("escapes backslashes and single quotes for fish (argv transport)", () => {
		// fish honors `\\` and `\'` inside single quotes, unlike bash, so the
		// POSIX form reaches the agent with backslash pairs collapsed.
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "match \\\\d+ in it's path",
				randomId: RANDOM_ID,
				shellFamily: "fish",
			}),
		).toBe(
			"'claude' '--dangerously-skip-permissions' 'match \\\\\\\\d+ in it\\'s path'",
		);
	});

	it("pipes the prompt into the agent under fish (stdin transport)", () => {
		expect(
			buildAgentCommandString({
				config: stdinConfig,
				rawPrompt: "do the thing",
				randomId: RANDOM_ID,
				shellFamily: "fish",
			}),
		).toBe("printf '%s' 'do the thing' | 'amp'");
	});

	it("falls back to POSIX output for unknown shells", () => {
		expect(
			buildAgentCommandString({
				config: argvConfig,
				rawPrompt: "do the thing",
				randomId: RANDOM_ID,
				shellFamily: "unknown",
			}),
		).toBe("'claude' '--dangerously-skip-permissions' 'do the thing'");
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

describe("isChatAgent", () => {
	it("is true only for the superset chat agent", () => {
		expect(isChatAgent("superset")).toBe(true);
		expect(isChatAgent("claude")).toBe(false);
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
			validateAgentEffortSelection("codex", "Codex", "max");
			throw new Error("Expected validation to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("BAD_REQUEST");
			expect((error as Error).message).toBe(
				'Unsupported reasoning effort "max" for Codex. Choose one of: low, medium, high, xhigh.',
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
