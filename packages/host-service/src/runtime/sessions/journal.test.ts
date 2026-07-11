import { describe, expect, test } from "bun:test";
import type { SessionEventFrame } from "@superset/session-protocol";
import { SessionJournal } from "./journal";

function stateFrame(label: string): SessionEventFrame {
	return {
		kind: "reset",
		reason: label,
	};
}

describe("SessionJournal", () => {
	test("assigns gapless sequences and tracks retained bounds", () => {
		const journal = new SessionJournal(10);
		const first = journal.append("session", stateFrame("one"));
		const second = journal.append("session", stateFrame("two"));
		expect(first.seq).toBe(1);
		expect(second.seq).toBe(2);
		expect(journal.latestSeq).toBe(2);
		expect(journal.oldestSeq).toBe(1);
	});

	test("replays exactly the retained tail after a cursor", () => {
		const journal = new SessionJournal(10);
		for (let index = 0; index < 5; index += 1) {
			journal.append("session", stateFrame(String(index)));
		}
		expect(journal.after(0)?.map((entry) => entry.seq)).toEqual([
			1, 2, 3, 4, 5,
		]);
		expect(journal.after(3)?.map((entry) => entry.seq)).toEqual([4, 5]);
		expect(journal.after(5)).toEqual([]);
	});

	test("rejects a cursor from a future journal epoch", () => {
		const journal = new SessionJournal(10);
		journal.append("session", stateFrame("one"));
		expect(journal.after(99)).toBeNull();
	});

	test("rejects a cursor whose missing tail was evicted", () => {
		const journal = new SessionJournal(3);
		for (let index = 0; index < 5; index += 1) {
			journal.append("session", stateFrame(String(index)));
		}
		expect(journal.oldestSeq).toBe(3);
		expect(journal.after(2)?.map((entry) => entry.seq)).toEqual([3, 4, 5]);
		expect(journal.after(1)).toBeNull();
	});

	test("pages matching envelopes backwards and returns ascending items", () => {
		const journal = new SessionJournal(10);
		for (let index = 0; index < 6; index += 1) {
			journal.append("session", stateFrame(String(index)));
		}
		const first = journal.page({
			limit: 2,
			matches: (entry) => entry.seq % 2 === 0,
		});
		expect(first.items.map((entry) => entry.seq)).toEqual([4, 6]);
		expect(first.nextBeforeSeq).toBe(4);
		const second = journal.page({
			beforeSeq: first.nextBeforeSeq ?? undefined,
			limit: 2,
			matches: (entry) => entry.seq % 2 === 0,
		});
		expect(second.items.map((entry) => entry.seq)).toEqual([2]);
		expect(second.nextBeforeSeq).toBeNull();
	});
});
