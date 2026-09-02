import { describe, expect, it } from "bun:test";
import {
	agentIsBusy,
	MAX_PINGS_PER_THREAD,
	selectThreadsToDeliver,
} from "./trigger.ts";
import type { WatchedThread, WatchedThreadComment } from "./types.ts";

const T0 = 1_800_000_000_000;

function comment(
	over: Partial<WatchedThreadComment> & { at: number },
): WatchedThreadComment {
	return {
		id: `c${over.at}`,
		body: "body",
		authorKind: over.authorKind ?? "human",
		authorName: over.authorName ?? "Sarah",
		createdAt: new Date(over.at),
	};
}

function thread(over: Partial<WatchedThread> = {}): WatchedThread {
	return {
		id: over.id ?? "t1",
		anchorKind: "element",
		anchor: { path: "div > p", tag: "p" },
		anchorText: "axis",
		resolved: over.resolved ?? false,
		version: over.version ?? 1,
		comments: over.comments ?? [comment({ at: T0 + 1000 })],
	};
}

const entry = (cursor: number, pings = new Map<string, number>()) => ({
	cursor,
	pings,
});

describe("selectThreadsToDeliver", () => {
	it("fires on a human comment newer than the cursor", () => {
		const result = selectThreadsToDeliver([thread()], entry(T0));
		expect(result.fired.map((t) => t.id)).toEqual(["t1"]);
		expect(result.firedCursor).toBe(T0 + 1000);
	});

	it("does not fire twice on the same comment", () => {
		const threads = [thread()];
		const first = selectThreadsToDeliver(threads, entry(T0));
		const second = selectThreadsToDeliver(threads, {
			cursor: first.firedCursor,
			pings: first.pings,
		});
		expect(second.fired).toEqual([]);
	});

	it("never fires on an agent's own reply", () => {
		const result = selectThreadsToDeliver(
			[
				thread({
					comments: [comment({ at: T0 + 5000, authorKind: "agent" })],
				}),
			],
			entry(T0),
		);
		expect(result.fired).toEqual([]);
		expect(result.firedCursor).toBe(0);
	});

	it("does not let an agent reply advance the cursor past an unseen human one", () => {
		const result = selectThreadsToDeliver(
			[
				thread({
					comments: [
						comment({ at: T0 + 1000 }),
						comment({ at: T0 + 9000, authorKind: "agent" }),
					],
				}),
			],
			entry(T0),
		);
		expect(result.fired.map((t) => t.id)).toEqual(["t1"]);
		expect(result.firedCursor).toBe(T0 + 1000);
	});

	it("skips resolved threads", () => {
		const result = selectThreadsToDeliver(
			[thread({ resolved: true })],
			entry(T0),
		);
		expect(result.fired).toEqual([]);
	});

	it("stops pinging a thread once it hits the ping ceiling", () => {
		let pings = new Map<string, number>();
		let cursor = T0;

		for (let i = 1; i <= MAX_PINGS_PER_THREAD; i += 1) {
			const result = selectThreadsToDeliver(
				[thread({ comments: [comment({ at: T0 + i * 1000 })] })],
				{ cursor, pings },
			);
			expect(result.fired.length).toBe(1);
			pings = result.pings;
			cursor = result.firedCursor;
		}

		const over = selectThreadsToDeliver(
			[
				thread({
					comments: [comment({ at: T0 + (MAX_PINGS_PER_THREAD + 1) * 1000 })],
				}),
			],
			{ cursor, pings },
		);
		expect(over.fired).toEqual([]);
		expect(over.suppressed).toEqual(["t1"]);
	});

	it("reports a suppressed thread's cursor separately so it can skip without a send", () => {
		const pings = new Map([["t1", MAX_PINGS_PER_THREAD]]);
		const result = selectThreadsToDeliver(
			[thread({ comments: [comment({ at: T0 + 4000 })] })],
			{ cursor: T0, pings },
		);
		expect(result.fired).toEqual([]);
		expect(result.suppressedCursor).toBe(T0 + 4000);
		expect(result.firedCursor).toBe(0);
	});

	it("batches every firing thread into one delivery", () => {
		const result = selectThreadsToDeliver(
			[
				thread({ id: "t1", comments: [comment({ at: T0 + 1000 })] }),
				thread({ id: "t2", comments: [comment({ at: T0 + 2000 })] }),
			],
			entry(T0),
		);
		expect(result.fired.map((t) => t.id)).toEqual(["t1", "t2"]);
		expect(result.firedCursor).toBe(T0 + 2000);
	});
});

describe("agentIsBusy", () => {
	it("treats a working agent as busy", () => {
		expect(agentIsBusy("Start")).toBe(true);
	});

	it("treats an agent waiting on a permission prompt as busy", () => {
		expect(agentIsBusy("PermissionRequest")).toBe(true);
	});

	it("treats a stopped or failed agent as free", () => {
		expect(agentIsBusy("Stop")).toBe(false);
		expect(agentIsBusy("Failed")).toBe(false);
	});

	it("treats an unknown or absent event as free rather than blocking forever", () => {
		expect(agentIsBusy(undefined)).toBe(false);
		expect(agentIsBusy("SomethingNew")).toBe(false);
	});
});
