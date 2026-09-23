import { describe, expect, it } from "bun:test";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";
import {
	HEARTBEAT_INTERVAL_MS,
	IDLE_TTL_MS,
	MAX_CONSECUTIVE_FAILURES,
	MAX_WATCHERS,
	type PageWatchApi,
	type PageWatchDeps,
	PageWatchManager,
} from "./page-watch-manager.ts";
import type { PageWatchAssignment, WatchedThread } from "./types.ts";

const T0 = 1_800_000_000_000;
function thread(id: string, at = T0): WatchedThread {
	return {
		id,
		anchorKind: "page",
		anchor: null,
		anchorText: null,
		resolved: false,
		version: 1,
		comments: [
			{
				id: `comment-${id}`,
				body: `${id} 👍🏽 日本語`,
				authorKind: "human",
				authorName: "Human",
				createdAt: new Date(at),
			},
		],
	};
}
function conflict() {
	return Object.assign(new Error("delivery reserved"), { code: "CONFLICT" });
}
function cloud() {
	const threads = new Map<string, WatchedThread[]>();
	const owners = new Map<
		string,
		{
			token: string;
			seenCommentIds: Set<string>;
			pings: Record<string, number>;
			reservation?: {
				id: string;
				ids: string[];
				pings: Record<string, number>;
			};
			finished?: string;
		}
	>();
	const calls = { claim: 0, renew: 0, reserve: 0, finish: 0, release: 0 };
	const api: PageWatchApi = {
		listThreads: async (id) => threads.get(id) ?? [],
		claimWatch: async ({ id, token }) => {
			calls.claim++;
			const old = owners.get(id);
			if (old?.reservation) throw conflict();
			const state = {
				token,
				seenCommentIds:
					old?.seenCommentIds ??
					new Set(
						(threads.get(id) ?? []).flatMap((t) =>
							t.comments
								.filter((c) => c.authorKind === "human")
								.map((c) => c.id),
						),
					),
				pings: old?.pings ?? {},
			};
			owners.set(id, state);
			return {
				token,
				seenCommentIds: [...state.seenCommentIds],
				pings: { ...state.pings },
			};
		},
		renewWatch: async ({ id, token }) => {
			calls.renew++;
			return { current: owners.get(id)?.token === token };
		},
		releaseWatch: async ({ id, token }) => {
			calls.release++;
			const state = owners.get(id);
			if (state?.token !== token) return { released: false };
			if (state.reservation) throw conflict();
			owners.delete(id);
			return { released: true };
		},
		reserveWatchDelivery: async ({ id, token, commentIds, pings }) => {
			calls.reserve++;
			const state = owners.get(id);
			if (state?.token !== token) return null;
			if (state.reservation) throw conflict();
			state.reservation = { id: crypto.randomUUID(), ids: commentIds, pings };
			return { reservationId: state.reservation.id, leaseMs: 10_000 };
		},
		finishWatchDelivery: async ({ id, token, reservationId, delivered }) => {
			calls.finish++;
			const state = owners.get(id);
			if (state?.token !== token) return { current: false };
			if (state.finished === reservationId) return { current: true };
			if (state.reservation?.id !== reservationId) return { current: false };
			if (delivered) {
				for (const id of state.reservation.ids) state.seenCommentIds.add(id);
				Object.assign(state.pings, state.reservation.pings);
			}
			state.reservation = undefined;
			state.finished = reservationId;
			return { current: true };
		},
	};
	return { api, threads, owners, calls };
}
function harness(shared = cloud(), overrides: Partial<PageWatchDeps> = {}) {
	let now = T0;
	const sent: { terminalId: string; text: string }[] = [];
	const events: string[] = [];
	const alive = new Set(["a", "b"]);
	const busy = new Set<string>();
	const agents = new Map<string, TerminalAgentBinding>(
		["a", "b"].map((terminalId) => [
			terminalId,
			{
				terminalId,
				workspaceId: `ws-${terminalId}`,
				agentId: "codex",
				startedAt: T0,
				lastEventAt: T0,
				lastEventType: "Attached",
			},
		]),
	);
	const send: PageWatchDeps["sendToTerminal"] = async (input) => {
		input.signal.throwIfAborted();
		const permit = await input.acquireDelivery();
		if (!permit?.isValid()) throw new Error("delivery cancelled");
		sent.push({ terminalId: input.terminalId, text: input.text });
	};
	const manager = new PageWatchManager({
		api: shared.api,
		sendToTerminal: send,
		getAgent: (id) => agents.get(id),
		isTerminalAlive: (id) => alive.has(id),
		isAgentBusy: (id) => busy.has(id),
		now: () => now,
		monotonicNow: () => now - T0,
		sleep: async (ms) => {
			now += ms;
		},
		setIntervalFn: (() => ({ unref() {} })) as unknown as typeof setInterval,
		clearIntervalFn: (() => {}) as typeof clearInterval,
		...overrides,
	});
	let terminalExit:
		| ((input: { eventType: string; terminalId: string }) => void)
		| undefined;
	manager.subscribeToTerminalEvents({
		onTerminalLifecycle: (fn: typeof terminalExit) => {
			terminalExit = fn;
			return () => {
				terminalExit = undefined;
			};
		},
		broadcastPageWatchChanged: ({ workspaceId }: { workspaceId: string }) =>
			events.push(workspaceId),
	} as never);
	const assign = (over: Partial<PageWatchAssignment> = {}) =>
		manager.assign({
			pageId: "page",
			slug: "page",
			title: "Page",
			terminalId: "a",
			workspaceId: "ws-a",
			agentId: null,
			...over,
		});
	return {
		manager,
		assign,
		agents,
		alive,
		busy,
		events,
		sent,
		send,
		shared,
		advance: (ms: number) => {
			now += ms;
		},
		exit: (terminalId: string) =>
			terminalExit?.({ eventType: "exit", terminalId }),
	};
}

describe("PageWatchManager", () => {
	for (const clockStep of [10_001, -1])
		it(`rejects wall-clock step ${clockStep} with a frozen monotonic clock`, async () => {
			const h = harness(undefined, { monotonicNow: () => 0 });
			await h.assign();
			const reserve = h.shared.api.reserveWatchDelivery;
			h.shared.api.reserveWatchDelivery = async (input) => {
				const reservation = await reserve(input);
				h.advance(clockStep);
				return reservation;
			};
			h.shared.threads.set("page", [thread("clock-step")]);
			await h.manager.tick();
			expect(h.sent).toEqual([]);
			expect(h.shared.owners.get("page")?.seenCommentIds.size).toBe(0);
			expect(h.shared.owners.get("page")?.reservation).toBeUndefined();
		});

	it("keeps reassignment to a live agent when the previous agent exits", async () => {
		const h = harness();
		await h.assign();
		const claim = h.shared.api.claimWatch;
		const entered = Promise.withResolvers<void>();
		const gate = Promise.withResolvers<void>();
		h.shared.api.claimWatch = async (input) => {
			entered.resolve();
			await gate.promise;
			return claim(input);
		};
		const assigning = h.assign({ terminalId: "b", workspaceId: "ws-b" });
		await entered.promise;
		h.alive.delete("a");
		h.exit("a");
		h.shared.threads.set("page", [thread("during-reassignment")]);
		gate.resolve();
		await assigning;
		expect(h.manager.list()[0]?.terminalId).toBe("b");
		await h.manager.tick();
		expect(h.sent.map(({ terminalId }) => terminalId)).toEqual(["b"]);
	});

	it("keeps the newest intent when initial target validations finish out of order", async () => {
		const gate = Promise.withResolvers<boolean>();
		const h = harness(undefined, {
			isTerminalAlive: (id) => (id === "a" ? gate.promise : true),
		});
		const older = h.assign();
		await h.assign({ terminalId: "b", workspaceId: "ws-b" });
		gate.resolve(true);
		await older;
		expect(h.manager.list()[0]?.terminalId).toBe("b");
		expect(h.shared.calls.claim).toBe(1);
	});
	for (const action of ["unwatch", "stop"] as const)
		it(`cancels initial target validation on ${action}`, async () => {
			const gate = Promise.withResolvers<boolean>();
			const h = harness(undefined, { isTerminalAlive: () => gate.promise });
			const pending = h.assign();
			if (action === "unwatch") await h.manager.unwatch("page");
			else h.manager.stop();
			gate.resolve(true);
			await pending;
			expect(h.shared.calls.claim).toBe(0);
			expect(h.manager.list()).toEqual([]);
		});
	it("rejects a binding returned for a different terminal", async () => {
		const h = harness();
		const b = h.agents.get("b");
		if (!b) throw new Error("Missing fixture");
		h.agents.set("a", { ...b, workspaceId: "ws-a" });
		await expect(h.assign()).rejects.toThrow();
		expect(h.shared.calls.claim).toBe(0);
	});
	for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"])
		it(`retires immediately on ${code}`, async () => {
			const h = harness();
			await h.assign();
			h.shared.api.listThreads = async () => {
				throw Object.assign(new Error(code), { data: { code } });
			};
			await h.manager.tick();
			expect(h.manager.list()).toEqual([]);
		});
	it("bounds cleanup retries after stopping during an outage", async () => {
		const h = harness();
		await h.assign();
		let attempts = 0;
		h.shared.api.releaseWatch = async () => {
			attempts++;
			throw new Error("offline");
		};
		h.manager.stop();
		for (let i = 0; i < 20; i++) await h.manager.tick();
		expect(attempts).toBe(MAX_CONSECUTIVE_FAILURES);
	});
	it("releases failed pending delivery acknowledgements before unwatch completes cleanup", async () => {
		const h = harness();
		await h.assign();
		const base = h.shared.api.finishWatchDelivery;
		let offline = true;
		h.shared.api.finishWatchDelivery = async (input) => {
			if (offline) throw new Error("offline");
			return base(input);
		};
		h.shared.threads.set("page", [thread("sent")]);
		await h.manager.tick();
		await h.manager.unwatch("page");
		expect(h.shared.owners.size).toBe(1);
		offline = false;
		await h.manager.tick();
		expect(h.shared.owners.size).toBe(0);
		expect(h.sent).toHaveLength(1);
	});
	it("rechecks permission state after waiting for the delivery reservation", async () => {
		const h = harness();
		await h.assign();
		const base = h.shared.api.reserveWatchDelivery;
		h.shared.api.reserveWatchDelivery = async (input) => {
			const reservation = await base(input);
			h.busy.add("a");
			return reservation;
		};
		h.shared.threads.set("page", [thread("held")]);
		await h.manager.tick();
		expect(h.sent).toEqual([]);
		expect(h.shared.owners.get("page")?.reservation).toBeUndefined();
	});
	it("expires a watch that remains busy past the idle TTL", async () => {
		const h = harness();
		await h.assign();
		h.busy.add("a");
		h.shared.threads.set("page", [thread("pending")]);
		await h.manager.tick();
		h.advance(IDLE_TTL_MS + 1);
		await h.manager.tick();
		expect(h.manager.list()).toEqual([]);
		expect(h.sent).toEqual([]);
	});
	it("throttles quiet polling while continuing ownership heartbeats", async () => {
		const h = harness();
		await h.assign();
		let reads = 0;
		h.shared.api.listThreads = async () => {
			reads++;
			return [];
		};
		h.advance(6 * 60_000);
		await h.manager.tick();
		expect(reads).toBe(1);
		h.advance(30_000);
		await h.manager.tick();
		expect(reads).toBe(1);
		expect(h.shared.calls.renew).toBe(2);
		h.advance(30_000);
		await h.manager.tick();
		expect(reads).toBe(2);
	});

	it("baselines existing comments on the server and delivers new IDs independently of clocks", async () => {
		const h = harness();
		h.shared.threads.set("page", [thread("old", T0 + 100000)]);
		await h.assign();
		h.shared.threads.get("page")?.push(thread("new", T0 - 100000));
		await h.manager.tick();
		await h.manager.tick();
		expect(h.sent).toHaveLength(1);
		expect(h.sent[0]?.text).toContain("new 👍🏽 日本語");
		expect(h.sent[0]?.text).not.toContain("old 👍🏽");
	});
	for (const agentId of [null, "custom-reviewer"])
		it(`does not confuse display label ${agentId} with agent identity`, async () => {
			const h = harness();
			await h.assign({ agentId });
			h.shared.threads.set("page", [thread("new")]);
			await h.manager.tick();
			expect(h.sent).toHaveLength(1);
		});
	it("rejects wrong-workspace and dead targets before publishing", async () => {
		const h = harness();
		await expect(h.assign({ workspaceId: "wrong" })).rejects.toThrow();
		h.alive.clear();
		await expect(h.assign()).rejects.toThrow();
		expect(h.shared.calls.claim).toBe(0);
	});
	it("revalidates the target after a slow cloud claim", async () => {
		const h = harness();
		const base = h.shared.api.claimWatch;
		const entered = Promise.withResolvers<void>();
		const gate = Promise.withResolvers<void>();
		h.shared.api.claimWatch = async (input) => {
			entered.resolve();
			await gate.promise;
			return base(input);
		};
		const assigning = h.assign();
		await entered.promise;
		h.alive.clear();
		gate.resolve();
		await expect(assigning).rejects.toThrow();
		expect(h.manager.list()).toEqual([]);
		expect(h.shared.owners.size).toBe(0);
	});
	it("notifies both workspaces when reassigning", async () => {
		const h = harness();
		await h.assign();
		h.events.length = 0;
		await h.assign({ terminalId: "b", workspaceId: "ws-b" });
		expect(h.events).toEqual(["ws-a", "ws-b"]);
		expect(h.manager.list("ws-a")).toEqual([]);
	});
	it("takes ownership across managers and stale release cannot clear the new owner", async () => {
		const shared = cloud();
		const a = harness(shared);
		const b = harness(shared);
		await a.assign();
		await b.assign({ terminalId: "b", workspaceId: "ws-b" });
		shared.threads.set("page", [thread("new")]);
		await Promise.all([a.manager.tick(), b.manager.tick()]);
		expect(a.sent).toEqual([]);
		expect(b.sent).toHaveLength(1);
		expect(a.manager.list()).toEqual([]);
		expect(shared.owners.size).toBe(1);
	});
	it("active takeover preserves delivered IDs so the new agent receives only new feedback", async () => {
		const shared = cloud();
		const a = harness(shared);
		const b = harness(shared);
		await a.assign();
		shared.threads.set("page", [thread("first")]);
		await a.manager.tick();
		await b.assign({ terminalId: "b", workspaceId: "ws-b" });
		shared.threads.get("page")?.push(thread("second"));
		await b.manager.tick();
		expect(b.sent).toHaveLength(1);
		expect(b.sent[0]?.text).toContain("second");
		expect(b.sent[0]?.text).not.toContain("first 👍🏽");
	});
	it("handles a same-timestamp comment that appears in a later fetch", async () => {
		const h = harness();
		await h.assign();
		h.shared.threads.set("page", [thread("first")]);
		await h.manager.tick();
		h.shared.threads.get("page")?.push(thread("second"));
		await h.manager.tick();
		expect(h.sent).toHaveLength(2);
	});
	it("serializes slow claims and the latest assignment wins", async () => {
		const h = harness();
		const base = h.shared.api.claimWatch;
		const entered = Promise.withResolvers<void>();
		const gate = Promise.withResolvers<void>();
		h.shared.api.claimWatch = async (input) => {
			if (h.shared.calls.claim === 0) {
				entered.resolve();
				await gate.promise;
			}
			return base(input);
		};
		const first = h.assign();
		await entered.promise;
		const second = h.assign({ terminalId: "b", workspaceId: "ws-b" });
		gate.resolve();
		await Promise.all([first, second]);
		expect(h.manager.list()[0]?.terminalId).toBe("b");
		expect(h.shared.owners.size).toBe(1);
	});
	for (const action of ["unwatch", "stop", "exit"] as const)
		it(`does not resurrect pending assignment after ${action}`, async () => {
			const h = harness();
			const base = h.shared.api.claimWatch;
			const entered = Promise.withResolvers<void>();
			const gate = Promise.withResolvers<void>();
			h.shared.api.claimWatch = async (input) => {
				entered.resolve();
				await gate.promise;
				return base(input);
			};
			const assigning = h.assign();
			await entered.promise;
			if (action === "unwatch") await h.manager.unwatch("page");
			else if (action === "stop") h.manager.stop();
			else h.exit("a");
			gate.resolve();
			await assigning;
			expect(h.manager.list()).toEqual([]);
			expect(h.shared.owners.size).toBe(0);
		});
	it("counts pending assignments toward the cap", async () => {
		const h = harness();
		const base = h.shared.api.claimWatch;
		const gate = Promise.withResolvers<void>();
		h.shared.api.claimWatch = async (input) => {
			await gate.promise;
			return base(input);
		};
		const pending = Array.from({ length: MAX_WATCHERS }, (_, i) =>
			h.assign({ pageId: `page-${i}` }),
		);
		await Promise.resolve();
		await Promise.resolve();
		await expect(h.assign({ pageId: "excess" })).rejects.toThrow(
			"already watching",
		);
		gate.resolve();
		await Promise.all(pending);
	});
	it("routes twenty pages independently across agents and overlapping ticks", async () => {
		const h = harness();
		for (let i = 0; i < MAX_WATCHERS; i++)
			await h.assign({
				pageId: `page-${i}`,
				terminalId: i % 2 ? "a" : "b",
				workspaceId: i % 2 ? "ws-a" : "ws-b",
			});
		for (let i = 0; i < MAX_WATCHERS; i++)
			h.shared.threads.set(`page-${i}`, [thread(`feedback-${i}`)]);
		await Promise.all([h.manager.tick(), h.manager.tick()]);
		expect(h.sent).toHaveLength(MAX_WATCHERS);
		for (let i = 0; i < MAX_WATCHERS; i++)
			expect(
				h.sent.find((sent) => sent.text.includes(`thread: feedback-${i}\n`))
					?.terminalId,
			).toBe(i % 2 ? "a" : "b");
	});
	it("does not let a stalled page block another page's delivery", async () => {
		const h = harness();
		await h.assign();
		await h.assign({ pageId: "other" });
		const gate = Promise.withResolvers<WatchedThread[]>();
		h.shared.api.listThreads = (id) =>
			id === "page" ? gate.promise : Promise.resolve([thread("other")]);
		const tick = h.manager.tick();
		for (let i = 0; i < 15; i++) await Promise.resolve();
		expect(h.sent).toHaveLength(1);
		gate.resolve([]);
		await tick;
	});
	it("cancels an old fetch after reassignment", async () => {
		const h = harness();
		await h.assign();
		const gate = Promise.withResolvers<WatchedThread[]>();
		const entered = Promise.withResolvers<void>();
		h.shared.api.listThreads = async () => {
			entered.resolve();
			return gate.promise;
		};
		const tick = h.manager.tick();
		await entered.promise;
		await h.assign({ terminalId: "b", workspaceId: "ws-b" });
		gate.resolve([thread("new")]);
		await tick;
		expect(h.sent).toHaveLength(0);
		await h.manager.tick();
		expect(h.sent[0]?.terminalId).toBe("b");
	});
	it("acquires ownership only at the terminal queue head and cancels reassigned work", async () => {
		const gate = Promise.withResolvers<void>();
		const entered = Promise.withResolvers<void>();
		let h: ReturnType<typeof harness>;
		h = harness(undefined, {
			sendToTerminal: async (input) => {
				entered.resolve();
				await gate.promise;
				return h.send(input);
			},
		});
		await h.assign();
		h.shared.threads.set("page", [thread("new")]);
		const tick = h.manager.tick();
		await entered.promise;
		expect(h.shared.calls.reserve).toBe(0);
		await h.assign({ terminalId: "b", workspaceId: "ws-b" });
		gate.resolve();
		await tick;
		expect(h.sent).toHaveLength(0);
		await h.manager.tick();
		expect(h.sent[0]?.terminalId).toBe("b");
	});
	it("does not type into an agent that became busy while queued", async () => {
		let h: ReturnType<typeof harness>;
		h = harness(undefined, {
			sendToTerminal: async (input) => {
				h.busy.add("a");
				return h.send(input);
			},
		});
		await h.assign();
		h.shared.threads.set("page", [thread("new")]);
		await h.manager.tick();
		expect(h.sent).toHaveLength(0);
		expect(h.shared.calls.reserve).toBe(0);
	});
	it("never forces delivery into a permission prompt even after two minutes", async () => {
		const h = harness();
		await h.assign();
		h.busy.add("a");
		h.shared.threads.set("page", [thread("new")]);
		await h.manager.tick();
		h.advance(180_000);
		await h.manager.tick();
		expect(h.sent).toEqual([]);
		h.busy.clear();
		await h.manager.tick();
		expect(h.sent).toHaveLength(1);
	});
	it("counts reserve round-trip time against the monotonic lease", async () => {
		const h = harness();
		await h.assign();
		const base = h.shared.api.reserveWatchDelivery;
		h.shared.api.reserveWatchDelivery = async (input) => {
			const result = await base(input);
			h.advance(10_001);
			return result;
		};
		h.shared.threads.set("page", [thread("new")]);
		await h.manager.tick();
		expect(h.sent).toHaveLength(0);
		expect(h.shared.owners.get("page")?.seenCommentIds.size).toBe(0);
		expect(h.shared.owners.get("page")?.reservation).toBeUndefined();
	});
	it("acknowledges a successful send again after a lost response without resending", async () => {
		const h = harness();
		await h.assign();
		const base = h.shared.api.finishWatchDelivery;
		let lost = true;
		h.shared.api.finishWatchDelivery = async (input) => {
			const result = await base(input);
			if (lost) {
				lost = false;
				throw new Error("response lost");
			}
			return result;
		};
		h.shared.threads.set("page", [thread("new")]);
		await h.manager.tick();
		expect(h.sent).toHaveLength(1);
		await h.manager.tick();
		expect(h.sent).toHaveLength(1);
		expect(h.shared.calls.finish).toBe(2);
	});
	it("holds new sends until a pending acknowledgement succeeds", async () => {
		const h = harness();
		await h.assign();
		const base = h.shared.api.finishWatchDelivery;
		let offline = true;
		h.shared.api.finishWatchDelivery = (input) => {
			if (offline) return Promise.reject(new Error("offline"));
			return base(input);
		};
		h.shared.threads.set("page", [thread("first")]);
		await h.manager.tick();
		h.shared.threads.get("page")?.push(thread("second"));
		await h.manager.tick();
		expect(h.sent).toHaveLength(1);
		offline = false;
		await h.manager.tick();
		expect(h.sent).toHaveLength(2);
	});
	it("does not retry input that was already staged in the terminal", async () => {
		const h = harness(undefined, {
			sendToTerminal: async ({ acquireDelivery }) => {
				await acquireDelivery();
				return { inputStaged: true };
			},
		});
		await h.assign();
		h.shared.threads.set("page", [thread("new")]);
		await h.manager.tick();
		expect(h.manager.list()).toEqual([]);
		expect(h.shared.calls.reserve).toBe(1);
		expect(h.shared.owners.size).toBe(0);
	});
	it("counts consecutive heartbeat failures across full poll cycles", async () => {
		const h = harness();
		await h.assign();
		h.advance(HEARTBEAT_INTERVAL_MS);
		h.shared.api.renewWatch = async () => {
			throw new Error("heartbeat offline");
		};
		for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) await h.manager.tick();
		expect(h.manager.list()).toEqual([]);
	});
	it("recovers failure count after a full successful cycle", async () => {
		const h = harness();
		await h.assign();
		const base = h.shared.api.listThreads;
		h.shared.api.listThreads = async () => {
			throw new Error("offline");
		};
		for (let i = 0; i < 4; i++) await h.manager.tick();
		h.shared.api.listThreads = base;
		await h.manager.tick();
		h.shared.api.listThreads = async () => {
			throw new Error("offline");
		};
		for (let i = 0; i < 4; i++) await h.manager.tick();
		expect(h.manager.list()).toHaveLength(1);
	});
	it("caps takeover retries when another delivery stays reserved", async () => {
		const h = harness();
		h.shared.api.claimWatch = async () => {
			throw conflict();
		};
		await expect(h.assign()).rejects.toThrow("reserved");
		expect(h.manager.list()).toEqual([]);
	});
	it("retries a temporary reservation conflict during takeover", async () => {
		const h = harness();
		const base = h.shared.api.claimWatch;
		let attempts = 0;
		h.shared.api.claimWatch = async (input) => {
			if (++attempts < 3) throw conflict();
			return base(input);
		};
		await h.assign();
		expect(attempts).toBe(3);
		expect(h.manager.list()).toHaveLength(1);
	});
	it("drops every page for an exited terminal without disturbing another agent", async () => {
		const h = harness();
		await h.assign();
		await h.assign({ pageId: "second" });
		await h.assign({ pageId: "other", terminalId: "b", workspaceId: "ws-b" });
		h.alive.delete("a");
		await h.manager.tick();
		expect(h.manager.list().map((entry) => entry.pageId)).toEqual(["other"]);
		expect(h.shared.owners.size).toBe(1);
	});
	it("retires a quiet watch at its TTL", async () => {
		const h = harness();
		await h.assign();
		h.advance(IDLE_TTL_MS + 1);
		await h.manager.tick();
		expect(h.manager.list()).toEqual([]);
	});
	it("acknowledges capped feedback without sending or wedging future polls", async () => {
		const h = harness();
		await h.assign();
		for (let i = 0; i < 7; i++) {
			const item = thread("same");
			for (const comment of item.comments) comment.id = `comment-${i}`;
			h.shared.threads.set("page", [item]);
			await h.manager.tick();
		}
		expect(h.sent).toHaveLength(5);
		expect(h.shared.owners.get("page")?.seenCommentIds.size).toBe(7);
	});
});
