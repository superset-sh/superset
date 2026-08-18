import { beforeEach, describe, expect, test } from "bun:test";
import type { DurableEnvelope } from "@superset/chat/protocol";
import { chatJournal } from "../db";
import type { ChatRuntime } from "../index";
import { ChatJournal } from "../journal";
import { agentMessage } from "../testing/fixtures";
import { createTestRuntime } from "../testing/testRuntime";
import { readPage, readSince } from "./replay";

const SESSION = "session-1";

function init() {
	return { sessionId: SESSION, scopeId: "workspace-1", harness: "fake" };
}

function seed(runtime: ChatRuntime, count: number) {
	for (let index = 1; index <= count; index += 1) {
		runtime.journal.append(SESSION, {
			type: "item",
			item: agentMessage(`item-${index}`, `text ${index}`),
			turnId: "turn-1",
		});
	}
}

function itemIds(envelopes: readonly DurableEnvelope[]): string[] {
	return envelopes.map((envelope) =>
		envelope.event.type === "item"
			? envelope.event.item.id
			: envelope.event.type,
	);
}

describe("readSince", () => {
	let runtime: ChatRuntime;

	beforeEach(() => {
		runtime = createTestRuntime();
	});

	test("returns only events after the cursor", () => {
		const opened = runtime.journal.open(init());
		seed(runtime, 5);
		const replay = readSince(runtime.db, SESSION, {
			epoch: opened.epoch,
			seq: 3,
		});
		expect(replay.ok).toBe(true);
		if (!replay.ok) return;
		expect(replay.envelopes.map((envelope) => envelope.cursor.seq)).toEqual([
			4, 5,
		]);
		expect(replay.envelopes[0]).toMatchObject({ v: 1, sessionId: SESSION });
	});

	test("signals session_not_found for an unknown session", () => {
		expect(readSince(runtime.db, "nope", { epoch: "e", seq: 0 })).toEqual({
			ok: false,
			reset: "session_not_found",
		});
	});

	test("signals epoch_changed for a stale-epoch cursor", () => {
		runtime.journal.open(init());
		seed(runtime, 2);
		expect(
			readSince(runtime.db, SESSION, { epoch: "stale-epoch", seq: 1 }),
		).toEqual({ ok: false, reset: "epoch_changed" });
	});

	test("signals invalid_cursor for a cursor ahead of the journal", () => {
		const opened = runtime.journal.open(init());
		seed(runtime, 2);
		expect(
			readSince(runtime.db, SESSION, { epoch: opened.epoch, seq: 9 }),
		).toEqual({ ok: false, reset: "invalid_cursor" });
	});

	test("signals journal_missing when the epoch's rows are gone", () => {
		const opened = runtime.journal.open(init());
		seed(runtime, 3);
		runtime.db.delete(chatJournal).run();
		expect(
			readSince(runtime.db, SESSION, { epoch: opened.epoch, seq: 2 }),
		).toEqual({ ok: false, reset: "journal_missing" });
	});

	test("a reopened session whose journal was lost mints a new epoch", () => {
		const opened = runtime.journal.open(init());
		seed(runtime, 3);
		runtime.db.delete(chatJournal).run();

		const reopened = new ChatJournal(runtime.db).open(init());
		expect(reopened.epoch).not.toBe(opened.epoch);
		expect(reopened.lastSeq).toBe(0);
		expect(
			readSince(runtime.db, SESSION, { epoch: opened.epoch, seq: 1 }),
		).toEqual({ ok: false, reset: "epoch_changed" });
	});

	test("an existing journal keeps its epoch across reopen", () => {
		const opened = runtime.journal.open(init());
		seed(runtime, 2);
		expect(new ChatJournal(runtime.db).open(init()).epoch).toBe(opened.epoch);
	});
});

describe("readPage", () => {
	let runtime: ChatRuntime;

	beforeEach(() => {
		runtime = createTestRuntime();
	});

	test("pages backwards from newest and reports the next bound", () => {
		const opened = runtime.journal.open(init());
		seed(runtime, 5);

		const newest = readPage(runtime.db, SESSION, { limit: 2 });
		expect(newest.ok).toBe(true);
		if (!newest.ok) return;
		expect(itemIds(newest.envelopes)).toEqual(["item-4", "item-5"]);
		expect(newest.nextBefore).toEqual({ epoch: opened.epoch, seq: 4 });

		const older = readPage(runtime.db, SESSION, {
			before: newest.nextBefore ?? undefined,
			limit: 2,
		});
		if (!older.ok) return;
		expect(itemIds(older.envelopes)).toEqual(["item-2", "item-3"]);
		expect(older.nextBefore).toEqual({ epoch: opened.epoch, seq: 2 });

		const oldest = readPage(runtime.db, SESSION, {
			before: older.nextBefore ?? undefined,
			limit: 2,
		});
		if (!oldest.ok) return;
		expect(itemIds(oldest.envelopes)).toEqual(["item-1"]);
		expect(oldest.nextBefore).toBeNull();
	});

	test("returns an empty page for an empty journal", () => {
		runtime.journal.open(init());
		expect(readPage(runtime.db, SESSION, { limit: 10 })).toEqual({
			ok: true,
			envelopes: [],
			nextBefore: null,
		});
	});

	test("signals epoch_changed for a stale-epoch bound", () => {
		runtime.journal.open(init());
		seed(runtime, 2);
		expect(
			readPage(runtime.db, SESSION, {
				before: { epoch: "stale", seq: 2 },
				limit: 2,
			}),
		).toEqual({ ok: false, reset: "epoch_changed" });
	});
});
