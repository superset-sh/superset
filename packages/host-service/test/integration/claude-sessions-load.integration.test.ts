/**
 * e2e for the session LOAD route — no tokens, no real Claude CLI.
 *
 * Exercises the exact production pipeline for reopening a session:
 *   real @anthropic-ai/claude-agent-sdk transcript reader (getSessionMessages)
 *   -> real ClaudeSessionManager.getMessages cursor pagination
 *   -> real timelineFromSessionMessages client fold.
 *
 * The reader is pointed at a synthetic 250-row transcript fixture through
 * CLAUDE_CONFIG_DIR (the SDK re-resolves its config dir whenever that env var
 * changes, so an in-process override is safe). The fixture places a
 * tool_use/tool_result pair straddling the newest page boundary to pin the
 * partial-load contract: the orphaned tool_result folds to an "Unknown tool"
 * placeholder that heals once the older page is prepended and refolded.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
	Query,
	SDKControlInitializeResponse,
	SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import {
	type FoldedTimeline,
	timelineFromSessionMessages,
} from "@superset/session-protocol";
import {
	ClaudeSessionManager,
	SessionCursorError,
} from "../../src/runtime/sessions";

const SESSION_ID = "00000000-0000-4000-8000-00000000c0de";
const WORKSPACE_ID = "00000000-0000-4000-8000-00000000beef";
const NATIVE_SESSION_ID = "11111111-2222-4333-8444-555555555555";
const PAGE_LIMIT = 100;
const TOTAL_ROWS = 250;
const TOOL_NAME = "TestTool";

/**
 * Transcript rows mirroring what Claude Code writes to
 * <config>/projects/<munged-cwd>/<sessionId>.jsonl. Row 0 is the user
 * prompt; each following pair is assistant(text + tool_use toolu_<k>)
 * then user(tool_result toolu_<k>). The final assistant tool_use
 * (toolu_124) has no result. With TOTAL_ROWS=250 and PAGE_LIMIT=100 the
 * newest page starts at row 150, a tool_result whose tool_use sits at
 * row 149 on the older page — the boundary straddle under test.
 */
function fixtureRows(cwd: string): string[] {
	const rowUuid = (index: number) =>
		`00000000-0000-4000-9000-${String(index).padStart(12, "0")}`;
	const base = (index: number) => ({
		uuid: rowUuid(index),
		parentUuid: index === 0 ? null : rowUuid(index - 1),
		sessionId: NATIVE_SESSION_ID,
		isSidechain: false,
		userType: "external",
		entrypoint: "cli",
		cwd,
		version: "2.1.207",
		gitBranch: "main",
		timestamp: new Date(1_700_000_000_000 + index * 1_000).toISOString(),
	});
	const rows: string[] = [];
	for (let index = 0; index < TOTAL_ROWS; index++) {
		if (index === 0) {
			rows.push(
				JSON.stringify({
					...base(index),
					type: "user",
					message: { role: "user", content: "run the tools" },
				}),
			);
			continue;
		}
		const pair = Math.floor((index - 1) / 2);
		if ((index - 1) % 2 === 0) {
			rows.push(
				JSON.stringify({
					...base(index),
					type: "assistant",
					message: {
						id: `msg_${String(index).padStart(4, "0")}`,
						type: "message",
						role: "assistant",
						model: "claude-test",
						content: [
							{ type: "text", text: `calling tool ${pair}` },
							{
								type: "tool_use",
								id: `toolu_${pair}`,
								name: TOOL_NAME,
								input: { step: pair },
							},
						],
					},
				}),
			);
		} else {
			rows.push(
				JSON.stringify({
					...base(index),
					type: "user",
					message: {
						role: "user",
						content: [
							{
								type: "tool_result",
								tool_use_id: `toolu_${pair}`,
								content: [{ type: "text", text: `tool ${pair} done` }],
								is_error: false,
							},
						],
					},
				}),
			);
		}
	}
	return rows;
}

/** Minimal Query stub: initialization succeeds, the stream stays open. */
function stubQuery(): Query {
	let pendingRead: ((result: IteratorResult<SDKMessage, void>) => void) | null =
		null;
	let closed = false;
	const initialization: SDKControlInitializeResponse = {
		commands: [],
		agents: [],
		output_style: "default",
		available_output_styles: ["default"],
		models: [],
		account: { email: "load-e2e@test", subscriptionType: "team" },
	};
	const stub = {
		[Symbol.asyncIterator]() {
			return this;
		},
		next(): Promise<IteratorResult<SDKMessage, void>> {
			if (closed) return Promise.resolve({ done: true, value: undefined });
			return new Promise((resolve) => {
				pendingRead = resolve;
			});
		},
		initializationResult: () => Promise.resolve(initialization),
		interrupt: () => Promise.resolve(),
		setModel: () => Promise.resolve(),
		setPermissionMode: () => Promise.resolve(),
		close: () => {
			closed = true;
			pendingRead?.({ done: true, value: undefined });
			pendingRead = null;
		},
	};
	return stub as unknown as Query;
}

function toolCallNames(timeline: FoldedTimeline): Map<string, string> {
	const names = new Map<string, string>();
	for (const item of timeline.items) {
		if (item.kind === "tool_call") names.set(item.id, item.name);
	}
	return names;
}

let configDir: string;
let projectDir: string;
let previousConfigDir: string | undefined;
let manager: ClaudeSessionManager;

beforeAll(async () => {
	// realpath: macOS tmpdir() is a symlink (/var -> /private/var) and the SDK
	// resolves real paths before munging project dirs into transcript folders.
	configDir = realpathSync(
		mkdtempSync(path.join(tmpdir(), "claude-load-e2e-config-")),
	);
	projectDir = realpathSync(
		mkdtempSync(path.join(tmpdir(), "claude-load-e2e-project-")),
	);
	// Same munge rule the SDK applies to project paths.
	const munged = projectDir.replace(/[^a-zA-Z0-9]/g, "-");
	const transcriptDir = path.join(configDir, "projects", munged);
	mkdirSync(transcriptDir, { recursive: true });
	writeFileSync(
		path.join(transcriptDir, `${NATIVE_SESSION_ID}.jsonl`),
		`${fixtureRows(projectDir).join("\n")}\n`,
	);
	previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
	process.env.CLAUDE_CONFIG_DIR = configDir;

	manager = new ClaudeSessionManager({
		resolveWorkspaceCwd: () => projectDir,
		getClaudeBaseEnvironment: () => ({ PATH: "/usr/bin" }),
		resolveClaudeExecutable: () => "/opt/claude/bin/claude",
		createNativeSessionId: () => NATIVE_SESSION_ID,
		queryFactory: () => stubQuery(),
		// getSessionMessages deliberately NOT injected: the real SDK reader runs.
	});
	await manager.create({ sessionId: SESSION_ID, workspaceId: WORKSPACE_ID });
});

afterAll(async () => {
	await manager?.dispose();
	if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
	else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
	rmSync(configDir, { recursive: true, force: true });
	rmSync(projectDir, { recursive: true, force: true });
});

describe("session load route (real reader + cursor pagination + fold)", () => {
	test("real SDK reader finds the fixture transcript through CLAUDE_CONFIG_DIR", async () => {
		const full = await getSessionMessages(NATIVE_SESSION_ID, {
			dir: projectDir,
			includeSystemMessages: true,
		});
		expect(full.length).toBe(TOTAL_ROWS);
		expect(full[0]?.type).toBe("user");
		expect(full.at(-1)?.type).toBe("assistant");
	});

	test("manager pagination walks the whole transcript without gaps or overlaps", async () => {
		const full = await getSessionMessages(NATIVE_SESSION_ID, {
			dir: projectDir,
			includeSystemMessages: true,
		});
		const pages: Awaited<ReturnType<typeof manager.getMessages>>[] = [];
		let cursor: string | undefined;
		for (;;) {
			const page = await manager.getMessages({
				sessionId: SESSION_ID,
				cursor,
				limit: PAGE_LIMIT,
			});
			pages.push(page);
			if (page.nextCursor === null) break;
			cursor = page.nextCursor;
		}
		expect(pages.map((page) => page.items.length)).toEqual([100, 100, 50]);
		const reassembled = pages
			.slice()
			.reverse()
			.flatMap((page) => page.items);
		expect(reassembled.map((message) => message.uuid)).toEqual(
			full.map((message) => message.uuid),
		);
	});

	test("invalid and out-of-range cursors are rejected", async () => {
		await expect(
			manager.getMessages({
				sessionId: SESSION_ID,
				cursor: "not-a-cursor",
				limit: PAGE_LIMIT,
			}),
		).rejects.toBeInstanceOf(SessionCursorError);
		await expect(
			manager.getMessages({
				sessionId: SESSION_ID,
				cursor: String(TOTAL_ROWS + 1),
				limit: PAGE_LIMIT,
			}),
		).rejects.toBeInstanceOf(SessionCursorError);
	});

	test("boundary-orphaned tool_result folds to a placeholder and heals on prepend", async () => {
		const newestPage = await manager.getMessages({
			sessionId: SESSION_ID,
			limit: PAGE_LIMIT,
		});
		// Row 150 (first item of the newest page) is toolu_74's result; its
		// tool_use lives at row 149 on the older page.
		const partial = toolCallNames(
			timelineFromSessionMessages(newestPage.items),
		);
		expect(partial.get("toolu_74")).toBe("Unknown tool");

		expect(newestPage.nextCursor).not.toBeNull();
		const olderPage = await manager.getMessages({
			sessionId: SESSION_ID,
			cursor: newestPage.nextCursor ?? undefined,
			limit: PAGE_LIMIT,
		});
		const healed = toolCallNames(
			timelineFromSessionMessages([...olderPage.items, ...newestPage.items]),
		);
		expect(healed.get("toolu_74")).toBe(TOOL_NAME);
	});

	test("fold of concatenated pages matches fold of the full transcript", async () => {
		const full = await getSessionMessages(NATIVE_SESSION_ID, {
			dir: projectDir,
			includeSystemMessages: true,
		});
		const fullTimeline = timelineFromSessionMessages(full);

		const pages: Awaited<ReturnType<typeof manager.getMessages>>[] = [];
		let cursor: string | undefined;
		for (;;) {
			const page = await manager.getMessages({
				sessionId: SESSION_ID,
				cursor,
				limit: PAGE_LIMIT,
			});
			pages.push(page);
			if (page.nextCursor === null) break;
			cursor = page.nextCursor;
		}
		const pagedTimeline = timelineFromSessionMessages(
			pages
				.slice()
				.reverse()
				.flatMap((page) => page.items),
		);
		expect(pagedTimeline.items).toEqual(fullTimeline.items);

		// 125 tool calls, none left as placeholders; the final tool_use
		// (toolu_124, result never written) still folds under its real name.
		const names = toolCallNames(fullTimeline);
		expect(names.size).toBe(125);
		expect([...names.values()].every((name) => name === TOOL_NAME)).toBe(true);
	});
});
