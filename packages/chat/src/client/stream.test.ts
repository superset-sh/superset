import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ChatStreamEvent } from "../shared/events";
import {
	startStream,
	type StartStreamOptions,
	type StreamFetchSnapshot,
	type StreamSubscribe,
	type StreamSubscribeOptions,
} from "./stream";

const SESSION = "s1";

// ---------------------------------------------------------------------------
// Fake transport — drives .onData via a push() helper the test controls.
// ---------------------------------------------------------------------------

interface FakeSubscribeControl {
	push: (event: ChatStreamEvent) => void;
	close: () => void;
	error: (err: unknown) => void;
	active: boolean;
	unsubscribeCalls: number;
}

function makeFakeSubscribe(): [StreamSubscribe, FakeSubscribeControl] {
	const control: FakeSubscribeControl = {
		push: () => {},
		close: () => {},
		error: () => {},
		active: false,
		unsubscribeCalls: 0,
	};
	const subscribe: StreamSubscribe = (_input, opts: StreamSubscribeOptions) => {
		control.active = true;
		control.push = (ev) => {
			if (!control.active) return;
			opts.onData(ev);
		};
		control.close = () => {
			if (!control.active) return;
			control.active = false;
			opts.onClose?.();
		};
		control.error = (err) => opts.onError?.(err);
		return {
			unsubscribe: () => {
				control.unsubscribeCalls += 1;
				control.active = false;
			},
		};
	};
	return [subscribe, control];
}

// ---------------------------------------------------------------------------
// Fake fetchSnapshot — yields canned snapshots in order.
// ---------------------------------------------------------------------------

function makeFakeSnapshot(
	queue: Array<{ sequence: number; status?: "idle" | "busy" }>,
): [StreamFetchSnapshot, { calls: number }] {
	const stats = { calls: 0 };
	const fetch: StreamFetchSnapshot = async () => {
		const next = queue.shift();
		if (!next) {
			throw new Error("fake snapshot queue exhausted");
		}
		stats.calls += 1;
		const snap: Extract<ChatStreamEvent, { type: "session.snapshot" }> = {
			type: "session.snapshot",
			sequence: next.sequence,
			sessionID: SESSION,
			at: next.sequence,
			snapshot: {
				messages: [],
				parts: {},
				status: { type: next.status ?? "idle" },
				historyMore: false,
			},
		};
		return { sequence: next.sequence, event: snap };
	};
	return [fetch, stats];
}

function status(seq: number): ChatStreamEvent {
	return {
		type: "session.status",
		sequence: seq,
		sessionID: SESSION,
		at: seq,
		status: { type: "idle" },
	};
}

// ---------------------------------------------------------------------------
// Helpers: start stream with a captured sink, return sink + control.
// ---------------------------------------------------------------------------

interface Harness {
	applied: ChatStreamEvent[];
	sub: FakeSubscribeControl;
	stop: () => void;
}

function start(
	snapshotQueue: Array<{ sequence: number; status?: "idle" | "busy" }>,
	overrides: Partial<StartStreamOptions> = {},
): Harness {
	const [subscribe, sub] = makeFakeSubscribe();
	const [fetchSnapshot] = makeFakeSnapshot(snapshotQueue);
	const applied: ChatStreamEvent[] = [];
	const handle = startStream({
		sessionID: SESSION,
		subscribe,
		fetchSnapshot,
		sink: { applyEvent: (ev) => applied.push(ev) },
		...overrides,
	});
	return { applied, sub, stop: handle.stop };
}

async function tick(): Promise<void> {
	// Yield to the microtask queue so bootstrap's awaited fetchSnapshot
	// resolves and classifyAndHandle runs over the event backlog.
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startStream", () => {
	let harness: Harness | null = null;
	afterEach(() => {
		harness?.stop();
		harness = null;
	});

	it("bootstraps with a snapshot then applies subsequent events", async () => {
		harness = start([{ sequence: 3 }]);
		await tick();
		expect(harness.applied).toHaveLength(1);
		expect(harness.applied[0]?.type).toBe("session.snapshot");
		harness.sub.push(status(4));
		expect(harness.applied).toHaveLength(2);
		expect(harness.applied[1]?.type).toBe("session.status");
	});

	it("defers events that arrive before bootstrap completes, then flushes in sequence", async () => {
		// Arrange: push two live events BEFORE the snapshot resolves.
		let resolveSnapshot: (() => void) | null = null;
		const deferredFetch: StreamFetchSnapshot = () =>
			new Promise((resolve) => {
				resolveSnapshot = () =>
					resolve({
						sequence: 2,
						event: {
							type: "session.snapshot",
							sequence: 2,
							sessionID: SESSION,
							at: 0,
							snapshot: {
								messages: [],
								parts: {},
								status: { type: "idle" },
								historyMore: false,
							},
						},
					});
			});

		const [subscribe, sub] = makeFakeSubscribe();
		const applied: ChatStreamEvent[] = [];
		const handle = startStream({
			sessionID: SESSION,
			subscribe,
			fetchSnapshot: deferredFetch,
			sink: { applyEvent: (ev) => applied.push(ev) },
		});

		sub.push(status(4));
		sub.push(status(3));
		expect(applied).toHaveLength(0); // neither has applied — still bootstrapping

		resolveSnapshot?.();
		await tick();
		await tick();

		// Snapshot first, then 3 and 4 in sorted order.
		expect(applied.map((e) => e.sequence)).toEqual([2, 3, 4]);
		handle.stop();
	});

	it("ignores events <= latestSequence", async () => {
		harness = start([{ sequence: 5 }]);
		await tick();
		harness.sub.push(status(3));
		harness.sub.push(status(4));
		harness.sub.push(status(5));
		// Only the snapshot should be applied.
		expect(harness.applied).toHaveLength(1);
	});

	it("recovers on a sequence gap by fetching a fresh snapshot", async () => {
		harness = start([{ sequence: 3 }, { sequence: 10 }]);
		await tick();
		// Jump from 3 to 7 — gap forces recover.
		harness.sub.push(status(7));
		await tick();
		await tick();
		// One bootstrap snapshot (seq 3), one recover snapshot (seq 10),
		// then the deferred event at seq 7 gets ignored because latest
		// has advanced past it.
		expect(harness.applied.map((e) => e.sequence)).toEqual([3, 10]);
	});

	it("applies a deferred event when the recovery snapshot closes the gap", async () => {
		harness = start([{ sequence: 3 }, { sequence: 6 }]);
		await tick();
		harness.sub.push(status(7));
		await tick();
		await tick();
		// Bootstrap=3, recover snapshot=6, deferred 7 is 6+1 (contiguous)
		// so it applies.
		expect(harness.applied.map((e) => e.sequence)).toEqual([3, 6, 7]);
	});

	it("keeps deferred events buffered when a gap remains after recovery", async () => {
		harness = start([{ sequence: 3 }, { sequence: 5 }]);
		await tick();
		// Gap between 5 and 7 — recovery snapshot at 5 doesn't cover it.
		harness.sub.push(status(7));
		await tick();
		await tick();
		// Bootstrap=3, recover snapshot=5, event 7 stays buffered (no 6).
		expect(harness.applied.map((e) => e.sequence)).toEqual([3, 5]);
	});

	it("tears down on stop() and ignores subsequent pushes", async () => {
		harness = start([{ sequence: 1 }]);
		await tick();
		harness.stop();
		harness.sub.push(status(2));
		expect(harness.applied.map((e) => e.sequence)).toEqual([1]);
		expect(harness.sub.unsubscribeCalls).toBe(1);
	});

	it("stop() is idempotent", async () => {
		harness = start([{ sequence: 1 }]);
		await tick();
		harness.stop();
		harness.stop();
		expect(harness.sub.unsubscribeCalls).toBe(1);
	});

	it("logs phase transitions through the optional logger", async () => {
		const [subscribe, sub] = makeFakeSubscribe();
		const [fetchSnapshot] = makeFakeSnapshot([{ sequence: 1 }]);
		const applied: ChatStreamEvent[] = [];
		const log: {
			bootstrapStart?: boolean;
			bootstrapComplete?: number;
			classify: Array<{ seq: number; decision: string }>;
		} = { classify: [] };
		const handle = startStream({
			sessionID: SESSION,
			subscribe,
			fetchSnapshot,
			sink: { applyEvent: (ev) => applied.push(ev) },
			logger: {
				onBootstrapStart: () => {
					log.bootstrapStart = true;
				},
				onBootstrapComplete: (seq) => {
					log.bootstrapComplete = seq;
				},
				onClassify: (seq, decision) => log.classify.push({ seq, decision }),
			},
		});
		sub.push(status(2));
		await tick();
		await tick();
		sub.push(status(3));
		expect(log.bootstrapStart).toBe(true);
		expect(log.bootstrapComplete).toBe(1);
		expect(log.classify.some((c) => c.seq === 3 && c.decision === "apply")).toBe(
			true,
		);
		handle.stop();
	});
});
