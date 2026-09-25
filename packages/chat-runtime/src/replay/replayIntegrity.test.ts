import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { chatJournal } from "../db";
import type { ChatRuntime } from "../index";
import { createTestRuntime } from "../testing/testRuntime";
import { FAKE_HARNESS, fakeHarnessRegistry } from "../testing/testUtils";
import { readPage, readSince } from "./replay";

function seededRuntime(): { runtime: ChatRuntime; sessionId: string } {
	const { harnesses } = fakeHarnessRegistry({ turns: [] });
	const runtime = createTestRuntime({ harnesses });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function corrupt(runtime: ChatRuntime, sessionId: string): void {
	runtime.db
		.update(chatJournal)
		.set({ eventJson: "{not json" })
		.where(eq(chatJournal.sessionId, sessionId))
		.run();
}

describe("journal integrity", () => {
	test("an unreadable row resets the replay instead of throwing", async () => {
		const { runtime, sessionId } = seededRuntime();
		const epoch = runtime.journal.cursor(sessionId).epoch;
		corrupt(runtime, sessionId);

		expect(readSince(runtime.db, sessionId, { epoch, seq: 0 })).toEqual({
			ok: false,
			reset: "journal_missing",
		});

		await runtime.dispose();
	});

	test("an unreadable row resets pagination instead of throwing", async () => {
		const { runtime, sessionId } = seededRuntime();
		corrupt(runtime, sessionId);

		expect(readPage(runtime.db, sessionId, { limit: 10 })).toEqual({
			ok: false,
			reset: "journal_missing",
		});

		await runtime.dispose();
	});

	test("a before cursor past the head is invalid, not the newest page", async () => {
		const { runtime, sessionId } = seededRuntime();
		const cursor = runtime.journal.cursor(sessionId);

		expect(
			readPage(runtime.db, sessionId, {
				before: { epoch: cursor.epoch, seq: cursor.seq + 5 },
				limit: 10,
			}),
		).toEqual({ ok: false, reset: "invalid_cursor" });

		const valid = readPage(runtime.db, sessionId, {
			before: { epoch: cursor.epoch, seq: cursor.seq },
			limit: 10,
		});
		expect(valid.ok).toBe(true);

		await runtime.dispose();
	});
});
