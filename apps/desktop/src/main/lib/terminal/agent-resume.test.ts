import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveAgentResumeTarget } from "./agent-resume";

describe("resolveAgentResumeTarget", () => {
	const originalHome = process.env.HOME;
	let testHome: string;

	beforeEach(() => {
		testHome = join(
			tmpdir(),
			`superset-agent-resume-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		);
		mkdirSync(testHome, { recursive: true });
		process.env.HOME = testHome;
	});

	afterEach(() => {
		rmSync(testHome, { recursive: true, force: true });
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
	});

	it("resolves a Claude resume command from the transcript cwd", async () => {
		const cwd = "/tmp/workspaces/claude";
		const sessionId = "claude-session-123";
		const transcriptPath = join(
			testHome,
			".claude",
			"projects",
			"workspace",
			`${sessionId}.jsonl`,
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			[
				JSON.stringify({ type: "last-prompt", sessionId }),
				JSON.stringify({ cwd, sessionId, type: "attachment" }),
			].join("\n"),
		);

		const result = await resolveAgentResumeTarget({
			agentId: "claude",
			cwd,
		});

		expect(result).toMatchObject({
			agentId: "claude",
			sessionId,
			resumeCommand: `claude --resume ${sessionId}`,
			sourcePath: transcriptPath,
		});
	});

	it("resolves a Codex resume command from session_meta", async () => {
		const cwd = "/tmp/workspaces/codex";
		const sessionId = "codex-session-456";
		const transcriptPath = join(
			testHome,
			".codex",
			"sessions",
			"2026",
			"06",
			"12",
			`rollout-2026-06-12T00-00-00-${sessionId}.jsonl`,
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			`${JSON.stringify({
				type: "session_meta",
				payload: { id: sessionId, cwd },
			})}\n`,
		);

		const result = await resolveAgentResumeTarget({
			agentId: "codex",
			cwd,
		});

		expect(result).toMatchObject({
			agentId: "codex",
			sessionId,
			resumeCommand: `codex resume ${sessionId}`,
			sourcePath: transcriptPath,
		});
	});

	it("prefers the stored agent session id when it is already known", async () => {
		const transcriptPath = join(
			testHome,
			".claude",
			"projects",
			"known",
			"known-session.jsonl",
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			JSON.stringify({
				type: "attachment",
				cwd: "/tmp/workspaces/known",
				sessionId: "known-session",
			}),
		);

		const result = await resolveAgentResumeTarget({
			agentId: "claude",
			sessionId: "known-session",
			cwd: "/tmp/workspaces/known",
		});

		expect(result).toEqual({
			agentId: "claude",
			sessionId: "known-session",
			resumeCommand: "claude --resume known-session",
			sourcePath: "session-location-log",
		});
	});

	it("falls back from a stored Claude background session id to the transcript match", async () => {
		const cwd = "/tmp/workspaces/claude";
		const transcriptPath = join(
			testHome,
			".claude",
			"projects",
			"workspace",
			"interactive-session.jsonl",
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			JSON.stringify({
				type: "attachment",
				cwd,
				sessionId: "interactive-session",
			}),
		);

		const result = await resolveAgentResumeTarget({
			agentId: "claude",
			sessionId: "background-session",
			cwd,
		});

		expect(result).toMatchObject({
			agentId: "claude",
			sessionId: "interactive-session",
			resumeCommand: "claude --resume interactive-session",
			sourcePath: transcriptPath,
		});
	});

	it("falls back from a stale stored Codex session id to the transcript match", async () => {
		const cwd = "/tmp/workspaces/codex";
		const transcriptPath = join(
			testHome,
			".codex",
			"sessions",
			"2026",
			"06",
			"12",
			"rollout-2026-06-12T00-00-00-fresh-session.jsonl",
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			`${JSON.stringify({
				type: "session_meta",
				payload: { id: "fresh-session", cwd },
			})}\n`,
		);

		const result = await resolveAgentResumeTarget({
			agentId: "codex",
			sessionId: "stale-session",
			cwd,
		});

		expect(result).toMatchObject({
			agentId: "codex",
			sessionId: "fresh-session",
			resumeCommand: "codex resume fresh-session",
			sourcePath: transcriptPath,
		});
	});

	it("scans the matching transcript store when the agent is known but the session id is missing", async () => {
		const workspacePath = "/tmp/workspaces/shared";
		const claudePath = join(
			testHome,
			".claude",
			"projects",
			"shared",
			"claude-session.jsonl",
		);
		const codexPath = join(
			testHome,
			".codex",
			"sessions",
			"2026",
			"06",
			"12",
			"rollout-2026-06-12T00-00-00-codex-session.jsonl",
		);
		mkdirSync(dirname(claudePath), { recursive: true });
		mkdirSync(dirname(codexPath), { recursive: true });
		writeFileSync(
			claudePath,
			JSON.stringify({
				type: "attachment",
				cwd: workspacePath,
				sessionId: "claude-session",
			}),
		);
		writeFileSync(
			codexPath,
			JSON.stringify({
				type: "session_meta",
				payload: { id: "codex-session", cwd: workspacePath },
			}),
		);
		const now = new Date();
		utimesSync(claudePath, now, now);
		utimesSync(
			codexPath,
			new Date(now.getTime() - 5_000),
			new Date(now.getTime() - 5_000),
		);

		const result = await resolveAgentResumeTarget({
			agentId: "claude",
			cwd: workspacePath,
		});

		expect(result).toMatchObject({
			agentId: "claude",
			sessionId: "claude-session",
			resumeCommand: "claude --resume claude-session",
		});
	});

	it("does not guess a resume target when the pane never established an agent identity", async () => {
		const workspacePath = "/tmp/workspaces/shared";
		const claudePath = join(
			testHome,
			".claude",
			"projects",
			"shared",
			"claude-session.jsonl",
		);
		mkdirSync(dirname(claudePath), { recursive: true });
		writeFileSync(
			claudePath,
			JSON.stringify({
				type: "attachment",
				cwd: workspacePath,
				sessionId: "claude-session",
			}),
		);

		const result = await resolveAgentResumeTarget({
			cwd: workspacePath,
		});

		expect(result).toBeNull();
	});

	it("ignores invalid session ids before building a resume command", async () => {
		const cwd = "/tmp/workspaces/claude";
		const transcriptPath = join(
			testHome,
			".claude",
			"projects",
			"workspace",
			"invalid-session.jsonl",
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			JSON.stringify({
				type: "attachment",
				cwd,
				sessionId: "claude-session; rm -rf /",
			}),
		);

		const fromTranscript = await resolveAgentResumeTarget({
			agentId: "claude",
			cwd,
		});
		const fromStoredIdentity = await resolveAgentResumeTarget({
			agentId: "claude",
			sessionId: "known-session && whoami",
			cwd,
		});

		expect(fromTranscript).toBeNull();
		expect(fromStoredIdentity).toBeNull();
	});

	it("preserves root directories when matching transcript cwd values", async () => {
		const sessionId = "root-session";
		const transcriptPath = join(
			testHome,
			".claude",
			"projects",
			"root",
			`${sessionId}.jsonl`,
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			JSON.stringify({
				type: "attachment",
				cwd: "/",
				sessionId,
			}),
		);

		const result = await resolveAgentResumeTarget({
			agentId: "claude",
			cwd: "/",
		});

		expect(result).toMatchObject({
			agentId: "claude",
			sessionId,
			resumeCommand: "claude --resume root-session",
		});
	});

	it("treats filesystem roots as ancestor paths during transcript matching", async () => {
		const sessionId = "root-ancestor-session";
		const transcriptPath = join(
			testHome,
			".claude",
			"projects",
			"root-ancestor",
			`${sessionId}.jsonl`,
		);
		mkdirSync(dirname(transcriptPath), { recursive: true });
		writeFileSync(
			transcriptPath,
			JSON.stringify({
				type: "attachment",
				cwd: "/",
				sessionId,
			}),
		);

		const result = await resolveAgentResumeTarget({
			agentId: "claude",
			cwd: "/tmp/workspaces/project",
		});

		expect(result).toMatchObject({
			agentId: "claude",
			sessionId,
			resumeCommand: "claude --resume root-ancestor-session",
		});
	});
});
