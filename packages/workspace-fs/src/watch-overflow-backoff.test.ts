import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getSearchIndex } from "./search";
import type { FsWatchEvent } from "./types";
import { FsWatcherManager, type FsWatcherManagerOptions } from "./watch";

/**
 * FSEvents overflow → coalesced, backed-off rescan. Overflow errors are
 * injected at the handler (`onUnexpectedError`) because the real kernel-queue
 * overflow can't be triggered deterministically in a unit test; everything
 * downstream of the handler (scheduling, coalescing, emit) is the real code.
 * Reaches into manager internals via structural casts — same pattern as
 * watch-pathtypes-growth.test.ts.
 */

const OVERFLOW_ERROR = new Error(
	"Events were dropped by the FSEvents client. File system must be re-scanned.",
);

interface WatcherStateView {
	overflowRescanTimer: unknown;
	overflowRescanDelayMs: number;
	overflowsCoalesced: number;
}

interface FsWatcherManagerInternal {
	watchers: Map<string, WatcherStateView>;
	onUnexpectedError(error: unknown, state: WatcherStateView): void;
}

const tempRoots: string[] = [];
const managers: FsWatcherManager[] = [];

afterEach(async () => {
	await Promise.all(managers.splice(0).map((m) => m.close()));
	await Promise.all(
		tempRoots
			.splice(0)
			.map((rootPath) => fs.rm(rootPath, { recursive: true, force: true })),
	);
});

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-overflow-"));
	const rootPath = await fs.realpath(tempPath);
	tempRoots.push(rootPath);
	return rootPath;
}

function createManager(options?: FsWatcherManagerOptions): FsWatcherManager {
	const manager = new FsWatcherManager(options);
	managers.push(manager);
	return manager;
}

async function subscribeWithEvents(
	manager: FsWatcherManager,
	rootPath: string,
): Promise<{
	events: FsWatchEvent[];
	overflowTimes: number[];
	state: WatcherStateView;
}> {
	const events: FsWatchEvent[] = [];
	const overflowTimes: number[] = [];
	await manager.subscribe({ absolutePath: rootPath }, (batch) => {
		events.push(...batch.events);
		for (const event of batch.events) {
			if (event.kind === "overflow") overflowTimes.push(Date.now());
		}
	});
	const internal = manager as unknown as FsWatcherManagerInternal;
	const state = internal.watchers.get(rootPath);
	if (!state) throw new Error("watcher state missing");
	return { events, overflowTimes, state };
}

function injectOverflow(manager: FsWatcherManager, state: WatcherStateView) {
	(manager as unknown as FsWatcherManagerInternal).onUnexpectedError(
		OVERFLOW_ERROR,
		state,
	);
}

async function waitUntil(
	predicate: () => boolean,
	label: string,
	timeoutMs = 5_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`Timed out waiting: ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

const overflowEvents = (events: FsWatchEvent[]) =>
	events.filter((event) => event.kind === "overflow");

describe("FSEvents overflow rescan backoff", () => {
	it("coalesces an overflow burst into one trailing rescan event", async () => {
		const rootPath = await createTempRoot();
		const manager = createManager({
			overflowRescanInitialMs: 100,
			overflowRescanMaxMs: 400,
			overflowBackoffResetMs: 10_000,
		});
		const { events, state } = await subscribeWithEvents(manager, rootPath);

		for (let i = 0; i < 25; i++) {
			injectOverflow(manager, state);
		}
		expect(state.overflowsCoalesced).toBe(25);
		expect(overflowEvents(events)).toHaveLength(0); // still suppressed

		await waitUntil(
			() => overflowEvents(events).length > 0,
			"trailing rescan event",
		);
		// Give a spare window to prove no extra rescans fire for the same burst.
		await new Promise((resolve) => setTimeout(resolve, 250));
		const rescans = overflowEvents(events);
		expect(rescans).toHaveLength(1);
		expect(rescans[0]).toEqual({
			kind: "overflow",
			absolutePath: rootPath,
			isDirectory: true,
		});
	});

	it("backs off exponentially to the cap while overflows keep arriving, and resets after quiet", async () => {
		const rootPath = await createTempRoot();
		const manager = createManager({
			overflowRescanInitialMs: 50,
			overflowRescanMaxMs: 200,
			overflowBackoffResetMs: 300,
		});
		const { events, state } = await subscribeWithEvents(manager, rootPath);

		injectOverflow(manager, state);
		expect(state.overflowRescanDelayMs).toBe(50); // window stable while armed
		await waitUntil(() => overflowEvents(events).length === 1, "rescan 1");
		expect(state.overflowRescanDelayMs).toBe(100); // doubled at fire

		injectOverflow(manager, state);
		await waitUntil(() => overflowEvents(events).length === 2, "rescan 2");
		expect(state.overflowRescanDelayMs).toBe(200); // doubled again

		injectOverflow(manager, state);
		await waitUntil(() => overflowEvents(events).length === 3, "rescan 3");
		expect(state.overflowRescanDelayMs).toBe(200); // capped

		// Quiet longer than the reset window → next overflow starts over.
		await new Promise((resolve) => setTimeout(resolve, 350));
		injectOverflow(manager, state);
		expect(state.overflowRescanDelayMs).toBe(50); // reset to initial
		await waitUntil(() => overflowEvents(events).length === 4, "rescan 4");
	});

	it("a change during the suppressed window is reflected after settle", async () => {
		const rootPath = await createTempRoot();
		const manager = createManager({
			debounceMs: 25,
			overflowRescanInitialMs: 150,
			overflowRescanMaxMs: 400,
			overflowBackoffResetMs: 10_000,
		});
		const { events, state } = await subscribeWithEvents(manager, rootPath);

		injectOverflow(manager, state);
		// A write whose native event was (hypothetically) dropped: the trailing
		// rescan's broad signal must still arrive so consumers refetch.
		await fs.writeFile(path.join(rootPath, "during-suppression.ts"), "x");
		injectOverflow(manager, state);

		await waitUntil(
			() => overflowEvents(events).length === 1,
			"trailing rescan after settle",
		);
	});

	it("rearms the trailing window when a second overflow lands near expiry", async () => {
		const rootPath = await createTempRoot();
		const manager = createManager({
			debounceMs: 25,
			overflowRescanInitialMs: 300,
			overflowRescanMaxMs: 2_000,
			overflowBackoffResetMs: 10_000,
		});
		const { overflowTimes: rescanTimes, state } = await subscribeWithEvents(
			manager,
			rootPath,
		);

		// Prime the index cache first so the final lookup can't pass by simply
		// building fresh — it must reflect invalidation/patching after the burst.
		const primed = await getSearchIndex({ rootPath, includeHidden: false });
		expect(
			primed.some((entry) =>
				entry.absolutePath.endsWith("between-overflows.ts"),
			),
		).toBe(false);

		injectOverflow(manager, state);
		await new Promise((resolve) => setTimeout(resolve, 200));
		// A change landing between the two overflows must survive the burst.
		await fs.writeFile(path.join(rootPath, "between-overflows.ts"), "x");
		injectOverflow(manager, state);
		const secondOverflowAt = Date.now();

		await waitUntil(() => rescanTimes.length > 0, "trailing rescan");
		// Must trail the SECOND overflow by a full window, not fire on the
		// first overflow's timer (~100ms after the second).
		const firstRescanAt = rescanTimes[0] ?? 0;
		expect(firstRescanAt - secondOverflowAt).toBeGreaterThanOrEqual(290);

		const index = await getSearchIndex({ rootPath, includeHidden: false });
		expect(
			index.some((entry) =>
				entry.absolutePath.endsWith("between-overflows.ts"),
			),
		).toBe(true);
	});

	it("sustained overflow cannot postpone rescans past the cap", async () => {
		const rootPath = await createTempRoot();
		const manager = createManager({
			overflowRescanInitialMs: 100,
			overflowRescanMaxMs: 300,
			overflowBackoffResetMs: 10_000,
		});
		const { overflowTimes: rescanTimes, state } = await subscribeWithEvents(
			manager,
			rootPath,
		);

		// Overflows every 50ms for ~1s: each rearm (window >= 100ms) would push
		// the rescan out forever without the batch deadline clamp.
		let lastInjectAt = 0;
		for (let i = 0; i < 20; i++) {
			injectOverflow(manager, state);
			lastInjectAt = Date.now();
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		const stormEndAt = Date.now();
		const duringStorm = rescanTimes.filter((t) => t <= stormEndAt);
		expect(duringStorm.length).toBeGreaterThanOrEqual(2);

		// And the storm still ends with a true trailing rescan: wait for rescans
		// to stop, then assert the final one trails the last overflow by a full
		// window (>= initial 100ms, minus scheduler tolerance) — a deadline-forced
		// fire right after the last overflow doesn't satisfy the guarantee alone.
		await waitUntil(
			() =>
				rescanTimes.length > 0 &&
				Date.now() - (rescanTimes[rescanTimes.length - 1] ?? 0) > 500,
			"rescans settled after sustained storm",
			8_000,
		);
		const finalRescanAt = rescanTimes[rescanTimes.length - 1] ?? 0;
		expect(finalRescanAt).toBeGreaterThan(lastInjectAt);
		expect(finalRescanAt - lastInjectAt).toBeGreaterThanOrEqual(90);
	});

	it("does not fire a pending rescan after the watcher is disposed", async () => {
		const rootPath = await createTempRoot();
		const manager = createManager({
			overflowRescanInitialMs: 50,
			overflowRescanMaxMs: 200,
			overflowBackoffResetMs: 10_000,
		});
		const events: FsWatchEvent[] = [];
		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			(batch) => {
				events.push(...batch.events);
			},
		);
		const internal = manager as unknown as FsWatcherManagerInternal;
		const state = internal.watchers.get(rootPath);
		if (!state) throw new Error("watcher state missing");

		injectOverflow(manager, state);
		await unsubscribe();
		expect(state.overflowRescanTimer).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(overflowEvents(events)).toHaveLength(0);
	});
});
