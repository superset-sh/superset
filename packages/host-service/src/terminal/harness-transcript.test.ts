import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	hasHarnessSession,
	readFileTail,
	readHarnessTranscript,
} from "./harness-transcript";

/**
 * The adapter reads from `~/.claude/projects/<encoded cwd>/`, so the fixture
 * lives under a temp worktree path that encodes into a directory of its own.
 */
const created: string[] = [];

function seedClaudeSession(lines: string[]): {
	worktreePath: string;
	sessionId: string;
} {
	const worktreePath = mkdtempSync(join(tmpdir(), "handoff-fixture-"));
	const sessionId = "11111111-2222-4333-8444-555555555555";
	const encoded = worktreePath.replaceAll(/[/.]/g, "-");
	const dir = join(homedir(), ".claude", "projects", encoded);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${sessionId}.jsonl`), `${lines.join("\n")}\n`);
	created.push(dir, worktreePath);
	return { worktreePath, sessionId };
}

afterEach(() => {
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

describe("readHarnessTranscript", () => {
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

		const result = readHarnessTranscript({
			agentId: "claude",
			agentSessionId: sessionId,
			worktreePath,
		});

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

		const result = readHarnessTranscript({
			agentId: "claude",
			agentSessionId: sessionId,
			worktreePath,
		});
		expect(result?.text).toBe("User: first");
	});

	test("reads only the tail of a file past the byte bound", () => {
		const dir = mkdtempSync(join(tmpdir(), "tail-fixture-"));
		created.push(dir);
		const path = join(dir, "big.jsonl");
		writeFileSync(path, `${"x".repeat(5000)}TAIL-MARKER`);

		const tail = readFileTail(path, 100);
		expect(tail).toBe(`${"x".repeat(89)}TAIL-MARKER`);
		expect(tail?.length).toBe(100);
	});

	test("reads only the tail of a very large session file", () => {
		// A long session's JSONL runs to megabytes; the host must not load and
		// parse all of it to answer one handoff.
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

		const result = readHarnessTranscript({
			agentId: "claude",
			agentSessionId: sessionId,
			worktreePath,
		});
		expect(result?.text).toContain("the newest thing said");
		// The oldest turns fall off the front rather than being parsed.
		expect(result?.text).not.toContain("old turn 0\n");
		expect(result?.text).not.toContain("old turn 1000\n");
	});

	test("declines harnesses with no store, so the PTY stream is used", () => {
		const { worktreePath, sessionId } = seedClaudeSession([
			JSON.stringify({
				type: "user",
				message: { role: "user", content: "hello" },
			}),
		]);

		expect(
			readHarnessTranscript({
				agentId: "codex",
				agentSessionId: sessionId,
				worktreePath,
			}),
		).toBeNull();
	});

	test("declines an unbound terminal", () => {
		expect(
			readHarnessTranscript({
				agentId: "claude",
				agentSessionId: null,
				worktreePath: "/tmp",
			}),
		).toBeNull();
	});

	test("refuses a session id that could escape the transcript directory", () => {
		expect(
			readHarnessTranscript({
				agentId: "claude",
				agentSessionId: "../../../../etc/passwd",
				worktreePath: "/tmp",
			}),
		).toBeNull();
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
		const worktreePath = mkdtempSync(join(tmpdir(), "pinned-worktree-"));
		created.push(worktreePath);
		const sessionId = "22222222-3333-4444-8555-666677778888";
		const dir = join(
			configDir,
			"projects",
			worktreePath.replaceAll(/[/.]/g, "-"),
		);
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
			readHarnessTranscript({
				agentId: "claude",
				agentSessionId: sessionId,
				worktreePath,
				env,
			})?.text,
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
