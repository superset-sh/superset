import { describe, expect, it } from "bun:test";
import {
	HEARTBEAT_INTERVAL_MS,
	IDLE_TTL_MS,
	MAX_CONSECUTIVE_FAILURES,
	MAX_HOLD_MS,
	MAX_WATCHERS,
	type PageWatchDeps,
	PageWatchManager,
} from "./page-watch-manager.ts";
import { MAX_PINGS_PER_THREAD } from "./trigger.ts";
import type { WatchedThread } from "./types.ts";

const T0 = 1_800_000_000_000;

function humanThread(id: string, at: number): WatchedThread {
	return {
		id,
		anchorKind: "element",
		anchor: { path: "div > p", tag: "p" },
		anchorText: "axis",
		resolved: false,
		version: 1,
		comments: [
			{
				id: `c-${id}`,
				body: "the axis is wrong",
				authorKind: "human",
				authorName: "Sarah",
				createdAt: new Date(at),
			},
		],
	};
}

function harness(
	options: {
		threads?: WatchedThread[];
		listThreads?: (pageId: string) => Promise<WatchedThread[]>;
		alive?: Set<string>;
		busy?: Set<string>;
		agents?: Set<string>;
		sendToTerminal?: PageWatchDeps["sendToTerminal"];
	} = {},
) {
	const sent: { terminalId: string; text: string }[] = [];
	const setWatchCalls: { pageId: string; agentId: string | null }[] = [];
	const clearWatchCalls: string[] = [];
	const alive = options.alive ?? new Set(["term-1"]);
	const busy = options.busy ?? new Set<string>();
	const agents = options.agents ?? new Set(["term-1", "term-2"]);
	let sendFails = false;
	let setWatchFails = false;
	let clock = T0;

	const manager = new PageWatchManager({
		api: {
			listThreads: options.listThreads ?? (async () => options.threads ?? []),
			setWatch: async (pageId, agentId) => {
				if (setWatchFails) {
					throw new Error(
						"Only the person who created this page can change it",
					);
				}
				setWatchCalls.push({ pageId, agentId });
			},
			clearWatch: async (pageId) => {
				clearWatchCalls.push(pageId);
			},
		},
		sendToTerminal: async ({ terminalId, text, signal }) => {
			if (sendFails) throw new Error("terminal gone");
			await options.sendToTerminal?.({
				workspaceId: "ws-1",
				terminalId,
				text,
				signal,
			});
			signal.throwIfAborted();
			sent.push({ terminalId, text });
		},
		isTerminalAlive: (terminalId) => alive.has(terminalId),
		isAgentBusy: (terminalId) => busy.has(terminalId),
		hasAgent: (terminalId) => agents.has(terminalId),
		now: () => clock,
		setIntervalFn: (() => {
			const handle = { unref() {} };
			return handle as unknown as ReturnType<typeof setInterval>;
		}) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as unknown as typeof clearInterval,
	});

	const assign = (over: Partial<{ pageId: string; terminalId: string }> = {}) =>
		manager.assign({
			pageId: over.pageId ?? "page-1",
			slug: "report-a1b2c3",
			title: "Report",
			workspaceId: "ws-1",
			terminalId: over.terminalId ?? "term-1",
			agentId: "claude",
		});

	return {
		manager,
		sent,
		setWatchCalls,
		clearWatchCalls,
		alive,
		busy,
		agents,
		assign,
		failSends: (value: boolean) => {
			sendFails = value;
		},
		failSetWatch: (value: boolean) => {
			setWatchFails = value;
		},
		advance: (ms: number) => {
			clock += ms;
		},
		at: () => clock,
	};
}

describe("PageWatchManager", () => {
	it("delivers a new human comment to the assigned terminal", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.advance(5_000);
		await h.manager.tick();

		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.terminalId).toBe("term-1");
		expect(h.sent[0]?.text).toContain("thread: t1");
		expect(h.sent[0]?.text).toContain("report-a1b2c3");
	});

	it("does not redeliver the same comment on the next tick", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.advance(5_000);
		await h.manager.tick();
		h.advance(10_000);
		await h.manager.tick();

		expect(h.sent.length).toBe(1);
	});

	it("watches many pages for one agent", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign({ pageId: "page-1" });
		await h.assign({ pageId: "page-2" });
		h.advance(5_000);
		await h.manager.tick();

		expect(h.manager.list("ws-1").length).toBe(2);
		expect(h.sent.length).toBe(2);
	});

	it("isolates all pages at the watcher cap across multiple agents", async () => {
		const alive = new Set(["term-0", "term-1", "term-2", "term-3"]);
		const h = harness({
			alive,
			agents: alive,
			listThreads: async (pageId) => [
				humanThread(`thread-${pageId}`, T0 + 5000),
			],
		});
		for (let index = 0; index < MAX_WATCHERS; index++) {
			await h.assign({
				pageId: `page-${index}`,
				terminalId: `term-${index % 4}`,
			});
		}
		h.advance(5000);
		await Promise.all([h.manager.tick(), h.manager.tick(), h.manager.tick()]);
		expect(h.sent).toHaveLength(MAX_WATCHERS);
		for (let index = 0; index < MAX_WATCHERS; index++) {
			const messages = h.sent.filter(({ text }) =>
				text.includes(`thread: thread-page-${index}\n`),
			);
			expect(messages).toHaveLength(1);
			expect(messages[0]?.terminalId).toBe(`term-${index % 4}`);
		}
	});

	it("a stalled page does not delay another agent's feedback", async () => {
		const gate = Promise.withResolvers<WatchedThread[]>();
		const delivered = Promise.withResolvers<void>();
		let commentAt = T0 + 5000;
		const h = harness({
			alive: new Set(["term-1", "term-2"]),
			listThreads: (pageId) =>
				pageId === "page-1"
					? gate.promise
					: Promise.resolve([humanThread("independent", commentAt)]),
			sendToTerminal: async () => {
				delivered.resolve();
			},
		});
		await h.assign();
		await h.assign({ pageId: "page-2", terminalId: "term-2" });
		h.advance(5000);
		const polling = h.manager.tick();
		try {
			await Promise.race([
				delivered.promise,
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("unrelated agent blocked by stalled page")),
						100,
					),
				),
			]);
			commentAt += 5000;
			h.advance(5000);
			await new Promise((resolve) => setTimeout(resolve, 0));
			await h.manager.tick();
			expect(h.sent.map(({ terminalId }) => terminalId)).toEqual([
				"term-2",
				"term-2",
			]);
		} finally {
			gate.resolve([]);
			await polling;
		}
		expect(h.sent[0]?.terminalId).toBe("term-2");
	});

	it("busy agents retain their own cursors while other agents receive feedback", async () => {
		const h = harness({
			alive: new Set(["term-1", "term-2"]),
			busy: new Set(["term-1"]),
			listThreads: async (pageId) => [humanThread(pageId, T0 + 5000)],
		});
		await h.assign();
		await h.assign({ pageId: "page-2" });
		await h.assign({ pageId: "page-3", terminalId: "term-2" });
		h.advance(5000);
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual(["term-2"]);
		h.busy.clear();
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual([
			"term-2",
			"term-1",
			"term-1",
		]);
		await h.manager.tick();
		expect(h.sent).toHaveLength(3);
	});

	it("one agent's failed delivery retries without duplicating another agent's feedback", async () => {
		let failing = true;
		const h = harness({
			alive: new Set(["term-1", "term-2"]),
			listThreads: async (pageId) => [humanThread(pageId, T0 + 5000)],
			sendToTerminal: async ({ terminalId }) => {
				if (terminalId === "term-1" && failing) throw new Error("send failed");
			},
		});
		await h.assign();
		await h.assign({ pageId: "page-2", terminalId: "term-2" });
		h.advance(5000);
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual(["term-2"]);
		failing = false;
		await h.manager.tick();
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual([
			"term-2",
			"term-1",
		]);
	});

	it("reassignment during a fetch sends only to the new agent", async () => {
		const gate = Promise.withResolvers<WatchedThread[]>();
		const h = harness({
			alive: new Set(["term-1", "term-2"]),
			listThreads: async () => gate.promise,
		});
		await h.assign();
		h.advance(5000);
		const polling = h.manager.tick();
		await h.assign({ terminalId: "term-2" });
		gate.resolve([humanThread("reassigned", T0 + 5000)]);
		await polling;
		expect(h.sent).toEqual([]);
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual(["term-2"]);
	});

	it("reassignment cancels queued delivery to the old agent", async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const h = harness({
			alive: new Set(["term-1", "term-2"]),
			threads: [humanThread("queued", T0 + 5000)],
			sendToTerminal: async ({ terminalId }) => {
				if (terminalId === "term-1") {
					entered.resolve();
					await release.promise;
				}
			},
		});
		await h.assign();
		h.advance(5000);
		const polling = h.manager.tick();
		await entered.promise;
		await h.assign({ terminalId: "term-2" });
		release.resolve();
		await polling;
		expect(h.sent).toEqual([]);
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual(["term-2"]);
	});

	it("stopping the manager cancels queued feedback from every page", async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		let queued = 0;
		const h = harness({
			threads: [humanThread("queued", T0 + 5000)],
			sendToTerminal: async () => {
				if (++queued === 2) entered.resolve();
				await release.promise;
			},
		});
		await h.assign();
		await h.assign({ pageId: "page-2" });
		h.advance(5000);
		const polling = h.manager.tick();
		await entered.promise;
		h.manager.stop();
		release.resolve();
		await polling;
		expect(h.sent).toEqual([]);
		expect(h.manager.list()).toEqual([]);
	});

	it("drops every page for a terminal that exits, and clears each cloud row", async () => {
		const h = harness();
		await h.assign({ pageId: "page-1" });
		await h.assign({ pageId: "page-2" });
		await h.assign({ pageId: "page-3", terminalId: "term-2" });
		h.alive.add("term-2");

		h.alive.delete("term-1");
		await h.manager.tick();

		expect(h.manager.list().map((w) => w.pageId)).toEqual(["page-3"]);
		expect(h.clearWatchCalls.sort()).toEqual(["page-1", "page-2"]);
	});

	it("refuses to exceed the watcher cap", async () => {
		const h = harness();
		for (let i = 0; i < MAX_WATCHERS; i += 1) {
			await h.assign({ pageId: `page-${i}` });
		}
		await expect(h.assign({ pageId: "one-too-many" })).rejects.toThrow();
		expect(h.manager.list().length).toBe(MAX_WATCHERS);
	});

	it("lets a reassignment of an existing page through the cap", async () => {
		const h = harness();
		for (let i = 0; i < MAX_WATCHERS; i += 1) {
			await h.assign({ pageId: `page-${i}` });
		}
		await expect(h.assign({ pageId: "page-0" })).resolves.toBeUndefined();
	});

	it("retires a page that has been quiet past the TTL", async () => {
		const h = harness();
		await h.assign();
		h.advance(IDLE_TTL_MS + 1);
		await h.manager.tick();

		expect(h.manager.list()).toEqual([]);
		expect(h.clearWatchCalls).toEqual(["page-1"]);
	});

	it("gives up after consecutive failures rather than retrying forever", async () => {
		let calls = 0;
		const h = harness({
			listThreads: async () => {
				calls += 1;
				throw new Error("offline");
			},
		});
		await h.assign();

		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
			h.advance(1_000);
			await h.manager.tick();
		}

		expect(calls).toBe(MAX_CONSECUTIVE_FAILURES);
		expect(h.manager.list()).toEqual([]);

		h.advance(1_000);
		await h.manager.tick();
		expect(calls).toBe(MAX_CONSECUTIVE_FAILURES);
	});

	it("recovers its failure count after a success", async () => {
		let fail = true;
		const h = harness({
			listThreads: async () => {
				if (fail) throw new Error("offline");
				return [];
			},
		});
		await h.assign();

		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
			h.advance(1_000);
			await h.manager.tick();
		}
		fail = false;
		h.advance(1_000);
		await h.manager.tick();

		fail = true;
		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
			h.advance(1_000);
			await h.manager.tick();
		}
		expect(h.manager.list().length).toBe(1);
	});

	it("heartbeats no more than once per heartbeat interval", async () => {
		const h = harness();
		await h.assign();

		h.advance(1_000);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(1);

		h.advance(1_000);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(1);

		h.advance(HEARTBEAT_INTERVAL_MS);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(2);
	});

	it("stops touching the cloud once every watcher is gone", async () => {
		const h = harness();
		await h.assign();
		await h.manager.unwatch("page-1");

		const before = h.setWatchCalls.length;
		h.advance(HEARTBEAT_INTERVAL_MS * 2);
		await h.manager.tick();
		expect(h.setWatchCalls.length).toBe(before);
	});

	it("retries a comment whose delivery failed instead of dropping it", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.failSends(true);
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);
		expect(h.manager.list().length).toBe(1);

		h.failSends(false);
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.text).toContain("thread: t1");
	});

	it("gives up after repeated send failures rather than retrying forever", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.failSends(true);
		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
			h.advance(5_000);
			await h.manager.tick();
		}
		expect(h.manager.list()).toEqual([]);
	});

	it("holds delivery while the agent is working", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.busy.delete("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
	});

	it("batches everything that arrived while the agent was busy into one send", async () => {
		const threads = [humanThread("t1", T0 + 1_000)];
		const h = harness({ listThreads: async () => threads });
		await h.assign();
		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();

		threads.push(humanThread("t2", T0 + 6_000));
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.busy.delete("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.text).toContain("thread: t1");
		expect(h.sent[0]?.text).toContain("thread: t2");
	});

	it("stops holding once the max hold elapses, so a wedged agent still hears", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(0);

		h.advance(MAX_HOLD_MS);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
	});

	it("refuses to watch a terminal with no agent in it", async () => {
		const h = harness({ agents: new Set() });
		await expect(h.assign()).rejects.toThrow();
		expect(h.manager.list()).toEqual([]);
	});

	it("refuses to watch a page the cloud will not let this user claim", async () => {
		const h = harness();
		h.failSetWatch(true);
		await expect(h.assign()).rejects.toThrow(
			"Only the person who created this page can change it",
		);
		expect(h.manager.list()).toEqual([]);
	});

	it("drops a watcher whose agent has gone, without typing into the bare shell", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.agents.delete("term-1");
		h.advance(5_000);
		await h.manager.tick();

		expect(h.sent).toEqual([]);
		expect(h.manager.list()).toEqual([]);
	});

	it("does not skip a live thread past a ping-capped one when nothing was sent", async () => {
		const capped = humanThread("capped", T0 + 9_000);
		const live = humanThread("live", T0 + 1_000);
		const h = harness({ listThreads: async () => [live, capped] });
		await h.assign();

		const entry = h.manager.list()[0];
		expect(entry).toBeDefined();
		for (let i = 0; i < MAX_PINGS_PER_THREAD; i += 1) {
			(
				h.manager as unknown as {
					entries: Map<string, { pings: Map<string, number> }>;
				}
			).entries
				.get("page-1")
				?.pings.set("capped", MAX_PINGS_PER_THREAD);
		}

		h.busy.add("term-1");
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent).toEqual([]);

		h.busy.delete("term-1");
		h.advance(5_000);
		await h.manager.tick();

		expect(h.sent.length).toBe(1);
		expect(h.sent[0]?.text).toContain("thread: live");
	});

	it("does not hold when the agent is idle", async () => {
		const h = harness({ threads: [humanThread("t1", T0 + 5_000)] });
		await h.assign();
		h.advance(5_000);
		await h.manager.tick();
		expect(h.sent.length).toBe(1);
	});

	it("drops a poll whose watcher was stopped while the fetch was in flight", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const h = harness({
			listThreads: async () => {
				await gate;
				return [humanThread("t1", T0 + 5_000)];
			},
		});
		await h.assign();
		const setWatchesAfterAssign = h.setWatchCalls.length;

		h.advance(HEARTBEAT_INTERVAL_MS + 5_000);
		const polling = h.manager.tick();
		await h.manager.unwatch("page-1");
		release();
		await polling;

		expect(h.sent).toEqual([]);
		expect(h.manager.list()).toEqual([]);
		expect(h.setWatchCalls.length).toBe(setWatchesAfterAssign);
	});

	it("counts a malformed thread as a failure instead of wedging the tick", async () => {
		const bad = humanThread("bad", T0 + 5_000);
		(bad.comments[0] as { createdAt: unknown }).createdAt = "not a date";
		const h = harness({
			listThreads: async (pageId) =>
				pageId === "page-1" ? [bad] : [humanThread("t2", T0 + 5_000)],
		});
		await h.assign({ pageId: "page-1" });
		await h.assign({ pageId: "page-2" });

		h.advance(5_000);
		await h.manager.tick();

		expect(h.sent.map((s) => s.text.includes("thread: t2"))).toEqual([true]);

		for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
			h.advance(5_000);
			await h.manager.tick();
		}
		expect(h.manager.list().map((w) => w.pageId)).toEqual(["page-2"]);
	});
});
