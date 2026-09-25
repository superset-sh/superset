import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import * as os from "node:os";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { hasHarnessSession, readHarnessTranscript } from ".";
import { claudeProjectDirName } from "./claude";

const BUDGET = 36_000;

/**
 * The adapter reads from `~/.claude/projects/<encoded cwd>/`, so the fixture
 * lives under a temp worktree path that encodes into a directory of its own.
 */
const created: string[] = [];

function seedClaudeSession(
	lines: string[],
	worktreePrefix = "handoff-fixture-",
): {
	worktreePath: string;
	sessionId: string;
} {
	const worktreePath = realpathSync(
		mkdtempSync(join(tmpdir(), worktreePrefix)),
	);
	const sessionId = "11111111-2222-4333-8444-555555555555";
	const dir = join(
		homedir(),
		".claude",
		"projects",
		claudeProjectDirName(worktreePath),
	);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${sessionId}.jsonl`), `${lines.join("\n")}\n`);
	created.push(dir, worktreePath);
	return { worktreePath, sessionId };
}

/** A session under a throwaway CLAUDE_CONFIG_DIR, so ~/.claude is untouched. */
function seedPinnedSession(
	body: string,
	worktreePath = "/nonexistent/worktree",
): {
	env: { CLAUDE_CONFIG_DIR: string };
	read: (maxChars?: number) => string | undefined;
} {
	const configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
	created.push(configDir);
	const dir = join(configDir, "projects", claudeProjectDirName(worktreePath));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "session.jsonl"), body);
	const env = { CLAUDE_CONFIG_DIR: configDir };
	return {
		env,
		read: (maxChars = BUDGET) =>
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId: "session",
					worktreePath,
					env,
				},
				maxChars,
			)?.text,
	};
}

const userLine = (content: string) =>
	JSON.stringify({ type: "user", message: { role: "user", content } });
const toolResultLine = (bytes: number) =>
	JSON.stringify({
		type: "user",
		message: {
			role: "user",
			content: [{ type: "tool_result", content: "x".repeat(bytes) }],
		},
	});

afterEach(() => {
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe("readHarnessTranscript", () => {
	test("preserves a consumed busy-session follow-up in conversation order", () => {
		// Claude Code 2.1.263: a prompt entered during a tool call is first
		// queued, then recorded as queued_command when the turn consumes it.
		const prompt = "Keep the existing API.\nAdd a regression for empty input.";
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({ type: "user", message: { content: "Fix the parser." } }),
			JSON.stringify({
				type: "queue-operation",
				operation: "enqueue",
				content: prompt,
			}),
			JSON.stringify({
				type: "queue-operation",
				operation: "remove",
				reason: "absorbed_mid_turn",
				content: prompt,
			}),
			JSON.stringify({
				type: "attachment",
				attachment: {
					type: "queued_command",
					commandMode: "prompt",
					prompt,
					source_uuid: "follow-up",
					origin: { kind: "human" },
				},
			}),
			JSON.stringify({
				type: "assistant",
				message: { content: "Kept the API and added the regression." },
			}),
		]);

		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId,
					worktreePath,
				},
				BUDGET,
			)?.text,
		).toBe(
			`User: Fix the parser.\n\nUser: ${prompt}\n\nAssistant: Kept the API and added the regression.`,
		);
	});

	test("excludes unconsumed queue operations and unrelated attachments", () => {
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({
				type: "user",
				message: { content: "Keep this instruction." },
			}),
			JSON.stringify({
				type: "queue-operation",
				operation: "enqueue",
				content: "Pending instruction",
			}),
			JSON.stringify({
				type: "queue-operation",
				operation: "remove",
				content: "Removed instruction",
			}),
			...[
				undefined,
				{ type: "other", commandMode: "prompt", prompt: "Unrelated" },
				{ type: "queued_command", commandMode: "bash", prompt: "echo shell" },
				{ type: "queued_command", commandMode: "prompt", prompt: "  " },
				{ type: "queued_command", commandMode: "prompt", prompt: null },
				{
					type: "queued_command",
					commandMode: "prompt",
					prompt: { text: "Malformed" },
				},
			].map((attachment) => JSON.stringify({ type: "attachment", attachment })),
		]);

		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId,
					worktreePath,
				},
				BUDGET,
			)?.text,
		).toBe("User: Keep this instruction.");
	});

	test("reads the conversation out of Claude's own store", () => {
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({ type: "mode", mode: "normal" }),
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "rename the widget" },
			}),
			JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "Renamed it in three files." },
						{ type: "tool_use", name: "Edit" },
					],
				},
			}),
		]);

		const result = readHarnessTranscript(
			{
				agentId: "claude",
				sessionId,
				worktreePath,
			},
			BUDGET,
		);

		expect(result?.harness).toBe("claude");
		expect(result?.text).toBe(
			"User: rename the widget\n\nAssistant: Renamed it in three files.",
		);
	});

	test("survives the half-written last line of a live session", () => {
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "first" },
			}),
			'{"type":"assistant","message":{"role":"assist',
		]);

		const result = readHarnessTranscript(
			{
				agentId: "claude",
				sessionId,
				worktreePath,
			},
			BUDGET,
		);
		expect(result?.text).toBe("User: first");
	});

	test("stops reading once the budget is filled", () => {
		// A long session's JSONL runs to megabytes; the host must not parse
		// more of it than the handoff can send.
		const filler = Array.from({ length: 80_000 }, (_, i) =>
			JSON.stringify({
				type: "assistant",
				message: {
					role: "assistant",
					content: [{ type: "text", text: `old turn ${i}` }],
				},
			}),
		);
		const { worktreePath, sessionId } = seedClaudeSession([
			...filler,
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "the newest thing said" },
			}),
		]);

		const result = readHarnessTranscript(
			{
				agentId: "claude",
				sessionId,
				worktreePath,
			},
			BUDGET,
		);
		expect(result?.text).toContain("the newest thing said");
		expect(result?.text).not.toContain("old turn 0\n");
		expect(result?.text).not.toContain("old turn 1000\n");
	});

	test("keeps early turns that fit the budget behind megabytes of tool output", () => {
		// Tool results and screenshots are most of a real session file: a
		// 48 MB session with 25k characters of conversation handed over only
		// its last six turns when the read stopped at a fixed 4 MB tail.
		const screenshot = "A".repeat(512 * 1024);
		const toolResults = Array.from({ length: 24 }, () =>
			JSON.stringify({
				type: "user",
				message: {
					role: "user",
					content: [
						{
							type: "tool_result",
							content: [{ type: "image", source: { data: screenshot } }],
						},
					],
				},
			}),
		);
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "the original request" },
			}),
			...toolResults,
			JSON.stringify({
				type: "assistant",
				message: { role: "assistant", content: "done" },
			}),
		]);

		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId,
					worktreePath,
				},
				BUDGET,
			)?.text,
		).toBe("User: the original request\n\nAssistant: done");
	});

	test("finds a session whose worktree path holds characters beyond / and .", () => {
		const { worktreePath, sessionId } = seedClaudeSession(
			[
				JSON.stringify({
					type: "user",
					message: { role: "user", content: "the whole conversation" },
				}),
			],
			"mason@feature_x branch-",
		);

		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId,
					worktreePath,
				},
				BUDGET,
			)?.text,
		).toBe("User: the whole conversation");
	});

	test("keeps what it already read when a wider read fails", () => {
		// Electron's V8 cannot hold a string past ~512 MB, so widening over a
		// very large session throws where the narrower read had succeeded.
		const { read } = seedPinnedSession(
			`${[userLine("early"), toolResultLine(5 * 1024 * 1024), userLine("late")].join("\n")}\n`,
		);
		const realOpen = fs.openSync;
		let opens = 0;
		const open = spyOn(fs, "openSync").mockImplementation(((
			...args: Parameters<typeof fs.openSync>
		) => {
			if (++opens > 1) throw new Error("ERR_STRING_TOO_LONG");
			return realOpen(...args);
		}) as typeof fs.openSync);
		try {
			expect(read()).toBe("User: late");
		} finally {
			open.mockRestore();
		}
	});

	test("drops a first line the tail cut inside a multi-byte character", () => {
		// Three filler lengths put the 4 MB cut on each byte of a 3-byte char.
		const cjk = "中".repeat(2_000);
		for (const shift of [0, 1, 2]) {
			const { read } = seedPinnedSession(
				`${[
					userLine("before the cut"),
					userLine(cjk),
					toolResultLine(4 * 1024 * 1024 - 3_000 + shift),
					userLine("after the cut"),
				].join("\n")}\n`,
			);
			expect(read(10)).toBe("User: after the cut");
		}
	});

	test("finds the session of a worktree reached through a symlink", () => {
		// Claude files a session under its resolved working directory.
		const real = realpathSync(mkdtempSync(join(tmpdir(), "real-worktree-")));
		const link = `${real}-link`;
		symlinkSync(real, link);
		created.push(real, link);
		const { env } = seedPinnedSession(`${userLine("via link")}\n`, real);

		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId: "session",
					worktreePath: link,
					env,
				},
				BUDGET,
			)?.text,
		).toBe("User: via link");
		expect(
			hasHarnessSession({
				agentId: "claude",
				sessionId: "session",
				worktreePath: link,
				env,
			}),
		).toBe(true);
	});

	test("declines harnesses with no store, so the PTY stream is used", () => {
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "hello" },
			}),
		]);

		expect(
			readHarnessTranscript(
				{
					agentId: "codex",
					sessionId,
					worktreePath,
				},
				BUDGET,
			),
		).toBeNull();
	});

	test("declines an unbound terminal", () => {
		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId: null,
					worktreePath: "/tmp",
				},
				BUDGET,
			),
		).toBeNull();
	});

	test("refuses a session id that could escape the transcript directory", () => {
		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId: "../../../../etc/passwd",
					worktreePath: "/tmp",
				},
				BUDGET,
			),
		).toBeNull();
	});
});

describe("Claude transcript lookup order", () => {
	const sessionId = "33333333-4444-4555-8666-777788889999";
	const worktreePath = "/work/tree";
	const encodedDir = claudeProjectDirName(worktreePath);
	let home: string;
	let homedirSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		home = realpathSync(mkdtempSync(join(tmpdir(), "claude-home-")));
		created.push(home);
		homedirSpy = spyOn(os, "homedir").mockReturnValue(home);
	});

	afterEach(() => {
		homedirSpy.mockRestore();
	});

	function seed(files: Record<string, string>): void {
		for (const [relative, body] of Object.entries(files)) {
			const path = join(home, relative);
			mkdirSync(join(path, ".."), { recursive: true });
			writeFileSync(path, body);
		}
	}

	const ref = (
		overrides: Partial<Parameters<typeof hasHarnessSession>[0]>,
	) => ({
		agentId: "claude",
		sessionId,
		worktreePath,
		env: { CLAUDE_CONFIG_DIR: join(home, ".claude-work") },
		...overrides,
	});
	const read = (
		overrides: Partial<Parameters<typeof hasHarnessSession>[0]> = {},
	) => readHarnessTranscript(ref(overrides), BUDGET)?.text;

	test("reads the file Claude's hook reported, even under another name", () => {
		// Orca: some Claude Code versions name the file by a different UUID
		// than the hook's session_id. The reported path is exact either way.
		seed({
			[`.claude-work/projects/${encodedDir}/${sessionId}.jsonl`]: `${userLine("from the encoded dir")}\n`,
			".claude-work/projects/moved/another-uuid.jsonl": `${userLine("from the reported path")}\n`,
		});

		expect(
			read({
				reportedPath: join(
					home,
					".claude-work/projects/moved/another-uuid.jsonl",
				),
			}),
		).toBe("User: from the reported path");
	});

	test("falls back when the reported path is missing, relative, or outside home", () => {
		seed({
			[`.claude-work/projects/${encodedDir}/${sessionId}.jsonl`]: `${userLine("the bound session")}\n`,
		});
		const outside = mkdtempSync(join(tmpdir(), "outside-home-"));
		created.push(outside);
		writeFileSync(
			join(outside, `${sessionId}.jsonl`),
			`${userLine("outside")}\n`,
		);

		for (const reportedPath of [
			join(home, ".claude-work/projects/gone", `${sessionId}.jsonl`),
			`projects/${encodedDir}/${sessionId}.jsonl`,
			join(outside, `${sessionId}.jsonl`),
			join(home, ".claude-work/notes.txt"),
		]) {
			expect(read({ reportedPath })).toBe("User: the bound session");
		}
	});

	test("finds the session by id when neither the report nor the encoding does", () => {
		// An agent started in a subdirectory, a CLAUDE_CODE_PROJECT_DIR_NAME
		// override, or a future naming scheme all file it somewhere else.
		seed({
			[`.claude-work/projects/-work-tree-packages-api/${sessionId}.jsonl`]: `${userLine("started in a subdirectory")}\n`,
		});

		expect(read()).toBe("User: started in a subdirectory");
		expect(read({ worktreePath: null })).toBe(
			"User: started in a subdirectory",
		);
		expect(hasHarnessSession(ref({ worktreePath: null }))).toBe(true);
	});

	test("reads history written to the default store before the account switched", () => {
		seed({
			[`.claude/projects/${encodedDir}/${sessionId}.jsonl`]: `${userLine("before the switch")}\n`,
			[`.claude-work/projects/${encodedDir}/.keep`]: "",
		});

		expect(read()).toBe("User: before the switch");
		// A relaunch runs under the new account and would not find it there.
		expect(hasHarnessSession(ref({}))).toBe(false);
	});

	test("prefers the launch env's store when both hold the session", () => {
		seed({
			[`.claude/projects/${encodedDir}/${sessionId}.jsonl`]: `${userLine("default store")}\n`,
			[`.claude-work/projects/${encodedDir}/${sessionId}.jsonl`]: `${userLine("account store")}\n`,
		});
		expect(read()).toBe("User: account store");
	});

	test("treats a blank CLAUDE_CONFIG_DIR as unset", () => {
		seed({
			[`.claude/projects/${encodedDir}/${sessionId}.jsonl`]: `${userLine("default store")}\n`,
		});
		expect(read({ env: { CLAUDE_CONFIG_DIR: "  " } })).toBe(
			"User: default store",
		);
		expect(hasHarnessSession(ref({ env: { CLAUDE_CONFIG_DIR: "" } }))).toBe(
			true,
		);
	});

	test("declines when no lookup finds the session", () => {
		seed({
			[`.claude-work/projects/${encodedDir}/00000000-0000-4000-8000-000000000000.jsonl`]:
				"{}\n",
		});
		expect(read()).toBeUndefined();
		expect(hasHarnessSession(ref({}))).toBe(false);
	});
});

describe("hasHarnessSession", () => {
	test("finds a Claude session and misses one that never existed", () => {
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "hello" },
			}),
		]);

		expect(
			hasHarnessSession({ agentId: "claude", sessionId, worktreePath }),
		).toBe(true);
		// The project directory exists (seedClaudeSession made it) and holds no
		// such session, which is the only shape that justifies a refusal.
		expect(
			hasHarnessSession({
				agentId: "claude",
				sessionId: "99999999-9999-4999-8999-999999999999",
				worktreePath,
			}),
		).toBe(false);
	});

	test("looks in the config dir the agent is pinned to", () => {
		// An agent with its own provider account carries CLAUDE_CONFIG_DIR, and
		// its sessions live there, not under ~/.claude. Reading the default
		// would call a live session missing and refuse a fork that works.
		const configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		created.push(configDir);
		const worktreePath = realpathSync(
			mkdtempSync(join(tmpdir(), "pinned-worktree-")),
		);
		created.push(worktreePath);
		const sessionId = "22222222-3333-4444-8555-666677778888";
		const dir = join(configDir, "projects", claudeProjectDirName(worktreePath));
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, `${sessionId}.jsonl`),
			`${JSON.stringify({ type: "user", message: { role: "user", content: "pinned" } })}\n`,
		);

		const env = { CLAUDE_CONFIG_DIR: configDir };
		expect(
			hasHarnessSession({ agentId: "claude", sessionId, worktreePath, env }),
		).toBe(true);
		expect(
			readHarnessTranscript(
				{
					agentId: "claude",
					sessionId,
					worktreePath,
					env,
				},
				BUDGET,
			)?.text,
		).toBe("User: pinned");

		// Without the env it is invisible. The answer is "unknown", not
		// "missing": the default config dir has no project directory for this
		// worktree, and a confident false there would block a working fork.
		expect(
			hasHarnessSession({ agentId: "claude", sessionId, worktreePath }),
		).toBeNull();
	});

	test("answers null for harnesses whose sessions we cannot inspect", () => {
		// grok keeps sessions server-side. Null means unknown, and the caller
		// must not read it as absence and block a fork that would have worked.
		for (const agentId of ["grok", "droid", "amp"]) {
			expect(
				hasHarnessSession({
					agentId,
					sessionId: "abc-123",
					worktreePath: "/tmp",
				}),
			).toBeNull();
		}
	});

	test("finds a pi session by its id suffix", () => {
		// pi files sessions per working directory as `<timestamp>_<id>.jsonl`,
		// so the id is matched on the suffix rather than by rebuilding its
		// encoding of the cwd.
		const root = join(homedir(), ".pi", "agent", "sessions", "--fixture--");
		mkdirSync(root, { recursive: true });
		created.push(root);
		const sessionId = "01a04f0f-1111-2222-3333-444455556666";
		writeFileSync(
			join(root, `2026-08-29T00-00-00-000Z_${sessionId}.jsonl`),
			"{}\n",
		);

		expect(
			hasHarnessSession({ agentId: "pi", sessionId, worktreePath: null }),
		).toBe(true);
		expect(
			hasHarnessSession({
				agentId: "pi",
				sessionId: "01a04f0f-9999-9999-9999-999999999999",
				worktreePath: null,
			}),
		).toBe(false);
	});

	test("answers null rather than false for unusable input", () => {
		expect(
			hasHarnessSession({
				agentId: "claude",
				sessionId: null,
				worktreePath: "/tmp",
			}),
		).toBeNull();
		expect(
			hasHarnessSession({
				agentId: "claude",
				sessionId: "../../escape",
				worktreePath: "/tmp",
			}),
		).toBeNull();
	});
});
