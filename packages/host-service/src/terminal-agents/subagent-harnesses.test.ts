import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	getSubagentHarness,
	isTrustedTranscriptPath,
	readSubagentTranscript,
} from "./subagent-harnesses";

const resolveSubagentTranscriptPath = (
	agentId: string,
	hint: Parameters<
		ReturnType<typeof getSubagentHarness>["resolveTranscriptPath"]
	>[0],
) => getSubagentHarness(agentId).resolveTranscriptPath(hint);

describe("resolveSubagentTranscriptPath", () => {
	it("prefers Claude's explicit child transcript from SubagentStop", () => {
		expect(
			resolveSubagentTranscriptPath("claude", {
				subagentId: "a1",
				sessionId: "s1",
				transcriptPath: "/p/s1.jsonl",
				agentTranscriptPath: "/p/s1/subagents/agent-a1.jsonl",
			}),
		).toBe("/p/s1/subagents/agent-a1.jsonl");
	});

	it("derives Claude's child file from the parent session transcript", () => {
		expect(
			resolveSubagentTranscriptPath("claude", {
				subagentId: "a1",
				sessionId: "s1",
				transcriptPath: "/p/s1.jsonl",
			}),
		).toBe("/p/s1/subagents/agent-a1.jsonl");
	});

	it("uses Codex's path as given even when its shape resembles Claude", () => {
		expect(
			resolveSubagentTranscriptPath("codex", {
				subagentId: "child",
				sessionId: "child",
				transcriptPath: "/codex/sessions/child.jsonl",
			}),
		).toBe("/codex/sessions/child.jsonl");
	});

	it("uses hook paths as given for an unregistered harness", () => {
		expect(
			resolveSubagentTranscriptPath("future-agent", {
				subagentId: "child",
				transcriptPath: "/future/child.jsonl",
			}),
		).toBe("/future/child.jsonl");
	});
});

describe("readSubagentTranscript", () => {
	it("uses the parent harness instead of inferring a parser from the path", () => {
		const dir = path.join(
			mkdtempSync(path.join(tmpdir(), "subagent-harness-")),
			"subagents",
		);
		mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "agent-child.jsonl");
		writeFileSync(
			file,
			JSON.stringify({
				type: "response_item",
				payload: {
					type: "message",
					role: "assistant",
					id: "m1",
					content: [{ type: "output_text", text: "Codex answer" }],
				},
			}),
		);

		expect(
			readSubagentTranscript(getSubagentHarness("codex"), file)?.entries,
		).toEqual([
			{
				id: "m1",
				kind: "assistant",
				text: "Codex answer",
				timestamp: undefined,
			},
		]);
	});

	it("reads Claude's task description from its transcript sidecar", () => {
		const dir = path.join(
			mkdtempSync(path.join(tmpdir(), "subagent-harness-")),
			"s1",
			"subagents",
		);
		mkdirSync(dir, { recursive: true });
		const file = path.join(dir, "agent-a1.jsonl");
		writeFileSync(
			file,
			JSON.stringify({
				type: "assistant",
				uuid: "a1",
				message: { role: "assistant", content: "Done" },
			}),
		);
		writeFileSync(
			path.join(dir, "agent-a1.meta.json"),
			JSON.stringify({ description: "Count files" }),
		);

		const transcript = readSubagentTranscript(
			getSubagentHarness("claude"),
			file,
		);
		expect(transcript?.description).toBe("Count files");
		expect(transcript?.entries).toHaveLength(1);
		expect(transcript?.size).toBeGreaterThan(0);
	});

	it("detects a known JSONL shape for an unregistered harness", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "subagent-harness-"));
		const file = path.join(dir, "child.jsonl");
		writeFileSync(
			file,
			JSON.stringify({
				type: "assistant",
				uuid: "a1",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Generic answer" }],
				},
			}),
		);

		expect(
			readSubagentTranscript(getSubagentHarness("future-agent"), file)
				?.entries[0],
		).toMatchObject({
			kind: "assistant",
			text: "Generic answer",
		});
	});

	it("returns null before the child has written anything", () => {
		expect(
			readSubagentTranscript(
				getSubagentHarness("claude"),
				"/nonexistent/agent-x.jsonl",
			),
		).toBeNull();
	});
});

describe("belongsToParentSession", () => {
	it("rejects a Claude child event that names a previous parent session", () => {
		const hint = { subagentId: "a1", sessionId: "s1" };
		const claude = getSubagentHarness("claude");
		expect(claude.belongsToParentSession(hint, "s2")).toBe(false);
		expect(claude.belongsToParentSession(hint, "s1")).toBe(true);
	});

	it("accepts when the harness cannot tell", () => {
		expect(
			getSubagentHarness("codex").belongsToParentSession(
				{ subagentId: "c1", sessionId: "child" },
				"root",
			),
		).toBe(true);
	});
});

describe("defineSubagentHarness defaults", () => {
	it("gives an unregistered harness the shared stop events, no description, and no parent evidence", () => {
		const harness = getSubagentHarness("future-agent");
		expect(harness.isStopEvent("SubagentStop")).toBe(true);
		expect(harness.isStopEvent("PostToolUse")).toBe(false);
		expect(harness.readDescription("/x.jsonl")).toBeUndefined();
		expect(
			harness.resolveParent({ subagentId: "c1" }, { siblings: [] }),
		).toEqual({ known: false });
	});
});

describe("resolveParent", () => {
	const claude = getSubagentHarness("claude");
	const claudeChild = (id: string, meta: Record<string, unknown> | null) => {
		const dir = path.join(
			mkdtempSync(path.join(tmpdir(), "claude-")),
			"s1",
			"subagents",
		);
		mkdirSync(dir, { recursive: true });
		const transcriptPath = path.join(dir, `agent-${id}.jsonl`);
		if (meta) {
			writeFileSync(
				path.join(dir, `agent-${id}.meta.json`),
				JSON.stringify(meta),
			);
		}
		return transcriptPath;
	};

	it("places a Claude child from its sidecar's parentAgentId", () => {
		const transcriptPath = claudeChild("a2", {
			agentType: "Explore",
			description: "Find the socket path",
			parentAgentId: "a1",
			spawnDepth: 2,
		});
		expect(
			claude.resolveParent(
				{ subagentId: "a2", sessionId: "s1", transcriptPath: "/p/s1.jsonl" },
				{ parentSessionId: "s1", siblings: [], transcriptPath },
			),
		).toEqual({ parentSubagentId: "a1", known: true });
	});

	it("places a Claude child with no parentAgentId directly under the agent", () => {
		const transcriptPath = claudeChild("a1", {
			agentType: "Explore",
			description: "Survey the sources",
		});
		expect(
			claude.resolveParent(
				{ subagentId: "a1", sessionId: "s1", transcriptPath: "/p/s1.jsonl" },
				{ parentSessionId: "s1", siblings: [], transcriptPath },
			),
		).toEqual({ known: true });
	});

	it("treats a sidecar naming the child itself as a direct child", () => {
		const transcriptPath = claudeChild("a1", { parentAgentId: "a1" });
		expect(
			claude.resolveParent(
				{ subagentId: "a1" },
				{ siblings: [], transcriptPath },
			),
		).toEqual({ known: true });
	});

	it("waits for a Claude sidecar that is not written yet", () => {
		const transcriptPath = claudeChild("a1", null);
		expect(
			claude.resolveParent(
				{ subagentId: "a1" },
				{ siblings: [], transcriptPath },
			),
		).toBeUndefined();
	});

	it("derives the sidecar path from the hook when the roster has no path yet", () => {
		const transcriptPath = claudeChild("a1", { parentAgentId: "a0" });
		const sessionPath = path.join(
			path.dirname(path.dirname(path.dirname(transcriptPath))),
			"s1.jsonl",
		);
		expect(
			claude.resolveParent(
				{ subagentId: "a1", sessionId: "s1", transcriptPath: sessionPath },
				{ parentSessionId: "s1", siblings: [] },
			),
		).toEqual({ parentSubagentId: "a0", known: true });
	});

	it("gives up on a Claude child with no transcript evidence at all", () => {
		expect(
			claude.resolveParent({ subagentId: "a1" }, { siblings: [] }),
		).toEqual({ known: false });
	});

	const codex = getSubagentHarness("codex");
	const sessionMeta = (
		id: string,
		parentThreadId: string,
		extra: Record<string, unknown> = {},
	) =>
		JSON.stringify({
			timestamp: "2026-03-30T03:28:54.047Z",
			type: "session_meta",
			payload: {
				id,
				session_id: id,
				cwd: "/repo",
				originator: "codex_cli_rs",
				source: {
					subagent: {
						thread_spawn: {
							parent_thread_id: parentThreadId,
							depth: 1,
							agent_path: null,
							agent_nickname: "Bohr",
							agent_role: "explorer",
						},
					},
				},
				agent_nickname: "Bohr",
				agent_role: "explorer",
				...extra,
			},
		});
	const rollout = (name: string, content: string) => {
		const file = path.join(
			mkdtempSync(path.join(tmpdir(), "codex-rollout-")),
			name,
		);
		writeFileSync(file, content);
		return file;
	};

	it("asks again while a Codex child's rollout has not been written", () => {
		expect(
			codex.resolveParent(
				{ subagentId: "c1" },
				{ siblings: [], transcriptPath: "/nonexistent/rollout.jsonl" },
			),
		).toBeUndefined();
		expect(
			codex.resolveParent(
				{ subagentId: "c1" },
				{ siblings: [], transcriptPath: rollout("empty.jsonl", "") },
			),
		).toBeUndefined();
	});

	it("places a Codex child spawned by the terminal's thread directly under the agent", () => {
		const file = rollout(
			"child.jsonl",
			`${sessionMeta("child-thread", "root-thread")}\n${JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [] } })}\n`,
		);
		expect(
			codex.resolveParent(
				{ subagentId: "c1", sessionId: "child-thread" },
				{ parentSessionId: "root-thread", siblings: [], transcriptPath: file },
			),
		).toEqual({ known: true });
	});

	it("places a Codex grandchild under the sibling whose thread spawned it", () => {
		const file = rollout(
			"grandchild.jsonl",
			`${sessionMeta("grandchild-thread", "child-thread")}\n`,
		);
		const siblings = [
			{
				id: "c1",
				sessionId: "child-thread",
				status: "working" as const,
				startedAt: 1,
				lastEventAt: 1,
			},
		];
		expect(
			codex.resolveParent(
				{ subagentId: "c2", sessionId: "grandchild-thread" },
				{ parentSessionId: "root-thread", siblings, transcriptPath: file },
			),
		).toEqual({ parentSubagentId: "c1", known: true });
	});

	it("gives up on a Codex child whose spawner is in neither the binding nor the roster", () => {
		const file = rollout(
			"orphan.jsonl",
			`${sessionMeta("orphan-thread", "unknown-thread")}\n`,
		);
		expect(
			codex.resolveParent(
				{ subagentId: "c3" },
				{ parentSessionId: "root-thread", siblings: [], transcriptPath: file },
			),
		).toEqual({ known: false });
		expect(
			codex.resolveParent(
				{ subagentId: "c4" },
				{
					siblings: [],
					transcriptPath: rollout(
						"main.jsonl",
						`${JSON.stringify({ type: "session_meta", payload: { id: "main", source: "cli" } })}\n`,
					),
				},
			),
		).toEqual({ known: false });
	});

	it("reads a Codex child's title from the rollout's first line", () => {
		const file = rollout(
			"titled.jsonl",
			`${sessionMeta("child-thread", "root-thread", { agent_path: "explorer.md" })}\n${"x".repeat(100)}\n`,
		);
		expect(codex.readDescription(file)).toBe("Bohr · explorer.md");
		expect(codex.readDescription("/nonexistent/rollout.jsonl")).toBeUndefined();
		expect(
			codex.readDescription(rollout("plain.jsonl", "not json\n")),
		).toBeUndefined();
	});
});

describe("isTrustedTranscriptPath", () => {
	it("keeps absolute .jsonl paths under home and drops the rest", () => {
		const home = "/home/u";
		expect(
			isTrustedTranscriptPath(
				"/home/u/.claude/projects/p/s/subagents/agent-a.jsonl",
				home,
			),
		).toBe(true);
		expect(
			isTrustedTranscriptPath(
				"/home/u/.codex/sessions/2026/09/06/rollout-x.jsonl",
				home,
			),
		).toBe(true);
		expect(isTrustedTranscriptPath("/etc/passwd", home)).toBe(false);
		expect(isTrustedTranscriptPath("/home/u/../root/x.jsonl", home)).toBe(
			false,
		);
		expect(isTrustedTranscriptPath("relative/x.jsonl", home)).toBe(false);
		expect(isTrustedTranscriptPath("/home/u/notes.txt", home)).toBe(false);
	});
});
