import { describe, expect, test } from "bun:test";
import type { SessionUpdateFrame } from "@superset/session-protocol";
import { SessionJournal } from "./journal";

function stateFrame(): SessionUpdateFrame {
	return {
		kind: "state",
		state: {
			sessionId: "s",
			workspaceId: "w",
			harness: "claude-agent-acp",
			status: "idle",
			title: null,
			currentMode: null,
			configOptions: [],
			pendingPermissions: [],
			cwd: "/tmp",
			lastSeq: 0,
			lastStopReason: null,
			lastError: null,
			createdAt: 0,
			updatedAt: 0,
		},
	};
}

function updateFrame(text: string): SessionUpdateFrame {
	return {
		kind: "update",
		update: {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text },
		},
	};
}

describe("SessionJournal", () => {
	test("assigns gapless seqs from 1 and tracks latest/oldest", () => {
		const journal = new SessionJournal(10);
		expect(journal.latestSeq).toBe(0);
		expect(journal.oldestSeq).toBe(0);
		const first = journal.append("s", updateFrame("a"));
		const second = journal.append("s", updateFrame("b"));
		expect(first.seq).toBe(1);
		expect(second.seq).toBe(2);
		expect(first.sessionId).toBe("s");
		expect(journal.latestSeq).toBe(2);
		expect(journal.oldestSeq).toBe(1);
	});

	test("after() replays exactly (since, latest]", () => {
		const journal = new SessionJournal(10);
		for (let i = 0; i < 5; i += 1) journal.append("s", updateFrame(`${i}`));
		expect(journal.after(0)?.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
		expect(journal.after(3)?.map((e) => e.seq)).toEqual([4, 5]);
		expect(journal.after(5)).toEqual([]);
	});

	test("after() reports a cursor ahead of the journal as unservable", () => {
		const journal = new SessionJournal(10);
		expect(journal.after(0)).toEqual([]);
		expect(journal.after(99)).toBeNull();
		journal.append("s", updateFrame("a"));
		expect(journal.after(1)).toEqual([]);
		expect(journal.after(2)).toBeNull();
	});

	test("evicts beyond capacity and reports unservable cursors as null", () => {
		const journal = new SessionJournal(3);
		for (let i = 0; i < 5; i += 1) journal.append("s", updateFrame(`${i}`));
		// seqs 1..5 appended, ring keeps [3, 4, 5]
		expect(journal.oldestSeq).toBe(3);
		expect(journal.latestSeq).toBe(5);
		expect(journal.after(2)?.map((e) => e.seq)).toEqual([3, 4, 5]);
		expect(journal.after(1)).toBeNull();
		expect(journal.after(0)).toBeNull();
	});

	test("preserves logical order after repeatedly wrapping the ring", () => {
		const journal = new SessionJournal(3);
		for (let i = 1; i <= 100; i += 1) {
			journal.append("s", updateFrame(`${i}`));
		}
		expect(journal.oldestSeq).toBe(98);
		expect(journal.after(97)?.map((entry) => entry.seq)).toEqual([98, 99, 100]);
		expect(
			journal
				.page({
					limit: 3,
					matches: (envelope) => envelope.frame.kind === "update",
				})
				.items.map((entry) => entry.seq),
		).toEqual([98, 99, 100]);
	});

	test("page() walks backwards, filters, and returns ascending items", () => {
		const journal = new SessionJournal(20);
		// alternate update and state frames: updates get seqs 1,3,5,7,9
		for (let i = 0; i < 5; i += 1) {
			journal.append("s", updateFrame(`${i}`));
			journal.append("s", stateFrame());
		}
		const isUpdate = (envelope: { frame: SessionUpdateFrame }) =>
			envelope.frame.kind === "update";

		const newest = journal.page({ limit: 2, matches: isUpdate });
		expect(newest.items.map((e) => e.seq)).toEqual([7, 9]);
		expect(newest.nextBeforeSeq).toBe(7);

		const older = journal.page({
			beforeSeq: newest.nextBeforeSeq ?? undefined,
			limit: 2,
			matches: isUpdate,
		});
		expect(older.items.map((e) => e.seq)).toEqual([3, 5]);
		expect(older.nextBeforeSeq).toBe(3);

		const oldest = journal.page({
			beforeSeq: older.nextBeforeSeq ?? undefined,
			limit: 2,
			matches: isUpdate,
		});
		expect(oldest.items.map((e) => e.seq)).toEqual([1]);
		expect(oldest.nextBeforeSeq).toBeNull();
	});

	test("page() reports exhaustion when no older matching frame remains", () => {
		const journal = new SessionJournal(20);
		journal.append("s", stateFrame()); // seq 1 — never matches
		journal.append("s", updateFrame("only")); // seq 2
		const page = journal.page({
			limit: 1,
			matches: (envelope) => envelope.frame.kind === "update",
		});
		expect(page.items.map((e) => e.seq)).toEqual([2]);
		// A state frame remains below, but no *matching* frame → exhausted.
		expect(page.nextBeforeSeq).toBeNull();
	});
});
