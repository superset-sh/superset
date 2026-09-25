import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gt } from "drizzle-orm";
import { CHAT_DB_FILENAME, chatJournal } from "../../db";
import { type ChatRuntime, createChatRuntime } from "../../index";
import { readSince } from "../../replay";
import {
	agentMessage,
	sessionState,
	userMessage,
} from "../../testing/fixtures";
import { createBunChatDb, createTestRuntime } from "../../testing/testRuntime";

const SESSION = "session-1";

function init() {
	return { sessionId: SESSION, scopeId: "workspace-1", harness: "fake" };
}

describe("ChatJournal", () => {
	let runtime: ChatRuntime;

	beforeEach(() => {
		runtime = createTestRuntime();
	});

	test("open mints an epoch and creates the projection row", () => {
		const opened = runtime.journal.open(init());
		expect(opened.epoch).toMatch(/^[0-9a-f-]{36}$/);
		expect(opened.lastSeq).toBe(0);
		expect(runtime.sessions.get(SESSION)).toMatchObject({
			sessionId: SESSION,
			scopeId: "workspace-1",
			harness: "fake",
			epoch: opened.epoch,
			status: "starting",
			queuedCount: 0,
			harnessSessionId: null,
		});
	});

	test("append assigns gapless seqs from 1 in a single epoch", () => {
		const opened = runtime.journal.open(init());
		const cursors = ["a", "b", "c"].map((id) =>
			runtime.journal.append(SESSION, {
				type: "item",
				item: agentMessage(id, id),
				turnId: "turn-1",
			}),
		);
		expect(cursors.map((cursor) => cursor.seq)).toEqual([1, 2, 3]);
		expect(new Set(cursors.map((cursor) => cursor.epoch))).toEqual(
			new Set([opened.epoch]),
		);
		expect(runtime.journal.cursor(SESSION)).toEqual({
			epoch: opened.epoch,
			seq: 3,
		});
	});

	test("replay returns durable events in append order", () => {
		const opened = runtime.journal.open(init());
		for (const id of ["a", "b", "c", "d"]) {
			runtime.journal.append(SESSION, {
				type: "item",
				item: agentMessage(id, id),
				turnId: "turn-1",
			});
		}
		const replay = readSince(runtime.db, SESSION, {
			epoch: opened.epoch,
			seq: 0,
		});
		expect(replay.ok).toBe(true);
		if (!replay.ok) return;
		expect(replay.envelopes.map((envelope) => envelope.cursor.seq)).toEqual([
			1, 2, 3, 4,
		]);
		expect(
			replay.envelopes.map((envelope) =>
				envelope.event.type === "item" ? envelope.event.item.id : null,
			),
		).toEqual(["a", "b", "c", "d"]);
	});

	test("projects session status and title from session events", () => {
		runtime.journal.open(init());
		runtime.journal.append(SESSION, {
			type: "session",
			session: sessionState({ status: "running", title: "Fix the build" }),
		});
		expect(runtime.sessions.get(SESSION)).toMatchObject({
			status: "running",
			title: "Fix the build",
		});

		runtime.journal.append(SESSION, {
			type: "session",
			session: sessionState({ status: "idle" }),
		});
		expect(runtime.sessions.get(SESSION)).toMatchObject({
			status: "idle",
			title: "Fix the build",
		});
	});

	test("projects queued_count from queued user messages", () => {
		runtime.journal.open(init());
		runtime.journal.append(SESSION, {
			type: "item",
			item: userMessage("u1", "one", { queued: true }),
			turnId: "turn-1",
		});
		runtime.journal.append(SESSION, {
			type: "item",
			item: userMessage("u2", "two", { queued: true }),
			turnId: "turn-1",
		});
		expect(runtime.sessions.get(SESSION)?.queuedCount).toBe(2);

		runtime.journal.append(SESSION, {
			type: "item",
			item: userMessage("u1", "one"),
			turnId: "turn-1",
		});
		expect(runtime.sessions.get(SESSION)?.queuedCount).toBe(1);
	});

	test("rebuilds queued_count and lastSeq from the journal on reopen", () => {
		const opened = runtime.journal.open(init());
		runtime.journal.append(SESSION, {
			type: "item",
			item: userMessage("u1", "one", { queued: true }),
			turnId: "turn-1",
		});
		runtime.journal.append(SESSION, {
			type: "session",
			session: sessionState({ status: "running", title: "Reopened" }),
		});

		runtime.journal.forget(SESSION);
		expect(runtime.journal.open(init())).toEqual({
			sessionId: SESSION,
			epoch: opened.epoch,
			lastSeq: 2,
			queuedCount: 1,
		});
	});

	test("a failed append leaves neither journal row nor projection change", () => {
		const opened = runtime.journal.open(init());
		runtime.journal.append(SESSION, {
			type: "session",
			session: sessionState({ status: "running", title: "before" }),
		});
		runtime.db
			.insert(chatJournal)
			.values({
				sessionId: SESSION,
				epoch: opened.epoch,
				seq: 2,
				ts: 1,
				eventJson: "{}",
			})
			.run();

		expect(() =>
			runtime.journal.append(SESSION, {
				type: "session",
				session: sessionState({ status: "dead", title: "after" }),
			}),
		).toThrow();

		expect(runtime.sessions.get(SESSION)).toMatchObject({
			status: "running",
			title: "before",
		});
		const rows = runtime.db
			.select()
			.from(chatJournal)
			.where(gt(chatJournal.seq, 1))
			.all();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.eventJson).toBe("{}");
	});

	test("append rejects events that do not parse as protocol events", () => {
		runtime.journal.open(init());
		expect(() =>
			runtime.journal.append(SESSION, {
				type: "item",
				item: { kind: "agent_message" },
				turnId: "turn-1",
			} as never),
		).toThrow();
	});
});

describe("chat.db lifecycle", () => {
	test("reopening the same dataDir preserves the journal and its epoch", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "chat-runtime-"));

		const first = createChatRuntime({ dataDir, openDatabase: createBunChatDb });
		const opened = first.journal.open(init());
		first.journal.append(SESSION, {
			type: "item",
			item: agentMessage("a", "hello"),
			turnId: "turn-1",
		});
		await first.dispose();

		expect(existsSync(join(dataDir, CHAT_DB_FILENAME))).toBe(true);

		const second = createChatRuntime({
			dataDir,
			openDatabase: createBunChatDb,
		});
		expect(second.journal.open(init())).toEqual({
			sessionId: SESSION,
			epoch: opened.epoch,
			lastSeq: 1,
			queuedCount: 0,
		});
		const replay = readSince(second.db, SESSION, {
			epoch: opened.epoch,
			seq: 0,
		});
		expect(replay.ok).toBe(true);
		if (!replay.ok) return;
		expect(replay.envelopes).toHaveLength(1);
		await second.dispose();
	});

	test("creates dataDir when it does not exist", async () => {
		const dataDir = join(
			mkdtempSync(join(tmpdir(), "chat-runtime-")),
			"nested",
		);
		const runtime = createChatRuntime({
			dataDir,
			openDatabase: createBunChatDb,
		});
		expect(existsSync(join(dataDir, CHAT_DB_FILENAME))).toBe(true);
		await runtime.dispose();
	});
});
