import { describe, expect, it } from "bun:test";
import type {
	QuotaCapableAgent,
	UsageAccount,
} from "../trpc/router/usage/types.ts";
import {
	BUDGET_MAX_REQUESTS,
	budgetMaxRequests,
	DISCOVERY_INTERVAL_MS,
	EXHAUSTED_POLL_MS,
	eligibleForSwitch,
	IDLE_POLL_MS,
	MAX_BACKOFF_MS,
	MIRROR_MAX_AGE_MS,
	QUOTA_TTL_MS,
	type QuotaEntry,
	QuotaStore,
	type QuotaStoreSnapshot,
	quotaEntryKey,
} from "./quota-store.ts";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

function account(
	agent: QuotaCapableAgent,
	selection: string | null,
	overrides: Partial<UsageAccount> = {},
): UsageAccount {
	return {
		agent,
		credentialKind: "subscription",
		accountKey: selection ?? `${agent}-default`,
		sourceLabel: selection ?? "~/.claude",
		email: `${selection ?? "default"}@example.com`,
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [
			{
				id: "five_hour",
				label: "Session (5h)",
				usedPercent: 10,
				resetsAt: null,
			},
		],
		creditsBalance: null,
		extraUsage: null,
		selection,
		accountId: null,
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(T0),
		...overrides,
	};
}

interface FetchOutcome {
	account: UsageAccount | null;
	rateLimited: boolean;
}

function harness(
	options: {
		claudeSelections?: Array<string | null>;
		claudeStatic?: UsageAccount[];
		codexSelections?: Array<string | null>;
		respondClaude?: (
			selection: string | null,
			at: number,
		) => Promise<FetchOutcome>;
	} = {},
) {
	let clock = T0;
	const state = {
		claudeSelections: options.claudeSelections ?? [null],
		claudeStatic: options.claudeStatic ?? ([] as UsageAccount[]),
		codexSelections: options.codexSelections ?? ([] as Array<string | null>),
		/** False stands for a scan that ran out of its time budget. */
		claudeComplete: true,
		/** A discovery pass that keeps throwing: local I/O that stopped working. */
		claudeDiscoveryFails: false,
		claudeDuplicateSelections: undefined as
			| Record<string, string[]>
			| undefined,
	};
	const calls: Array<{ key: string; at: number }> = [];
	const snapshots: QuotaStoreSnapshot[] = [];
	const store = new QuotaStore({
		now: () => clock,
		discoverClaude: async () => {
			if (state.claudeDiscoveryFails) throw new Error("profile scan failed");
			return {
				selections: state.claudeSelections,
				staticAccounts: state.claudeStatic,
				complete: state.claudeComplete,
				duplicateSelections: state.claudeDuplicateSelections,
			};
		},
		discoverCodex: async () => ({
			selections: state.codexSelections,
			staticAccounts: [],
		}),
		fetchClaude: async (selection) => {
			calls.push({ key: quotaEntryKey("claude", selection), at: clock });
			if (options.respondClaude) return options.respondClaude(selection, clock);
			return { account: account("claude", selection), rateLimited: false };
		},
		fetchCodex: async (selection) => {
			calls.push({ key: quotaEntryKey("codex", selection), at: clock });
			return { account: account("codex", selection), rateLimited: false };
		},
		fetchGrok: async () => {
			calls.push({ key: "grok", at: clock });
			return [account("grok", null)];
		},
		fetchAgy: async () => {
			calls.push({ key: "agy", at: clock });
			return [account("agy", null)];
		},
		onSnapshot: (snapshot) => snapshots.push(snapshot),
	});
	return {
		store,
		state,
		calls,
		snapshots,
		get now() {
			return clock;
		},
		advance(ms: number) {
			clock += ms;
		},
		callsFor(key: string) {
			return calls.filter((call) => call.key === key);
		},
	};
}

function requireEntry(store: QuotaStore, key: string): QuotaEntry {
	const entry = store.entry(key);
	if (!entry) throw new Error(`no quota entry for ${key}`);
	return entry;
}

const CLAUDE_DEFAULT = quotaEntryKey("claude", null);
const CLAUDE_A = quotaEntryKey("claude", "/profiles/a");
const CLAUDE_B = quotaEntryKey("claude", "/profiles/b");

describe("QuotaStore on demand (engine disabled)", () => {
	it("fetches once and serves cached numbers within the TTL", async () => {
		const h = harness({ claudeSelections: [null, "/profiles/a"] });

		const first = await h.store.read({ agents: ["claude"] });
		expect(first).toHaveLength(2);
		expect(h.calls).toHaveLength(2);

		h.advance(QUOTA_TTL_MS - 1);
		const second = await h.store.read({ agents: ["claude"] });
		expect(second).toHaveLength(2);
		expect(h.calls).toHaveLength(2);

		h.advance(1);
		await h.store.read({ agents: ["claude"] });
		expect(h.calls).toHaveLength(4);
	});

	it("coalesces two concurrent reads of one stale entry into one fetch", async () => {
		const h = harness({ claudeSelections: [null] });
		const [a, b] = await Promise.all([
			h.store.read({ agents: ["claude"] }),
			h.store.read({ agents: ["claude"] }),
		]);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
	});

	it("refetches on forceRefresh", async () => {
		const h = harness({ claudeSelections: [null] });
		await h.store.read({ agents: ["claude"] });
		await h.store.read({ agents: ["claude"], forceRefresh: true });
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(2);
	});

	it("invalidate drops only that entry and the next read refetches it", async () => {
		const h = harness({ claudeSelections: [null, "/profiles/a"] });
		await h.store.read({ agents: ["claude"] });
		expect(h.calls).toHaveLength(2);

		h.store.invalidate(CLAUDE_A);
		await h.store.read({ agents: ["claude"] });

		expect(h.callsFor(CLAUDE_A)).toHaveLength(2);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
	});

	it("answers with every profile on the first read, even past the budget", async () => {
		// More selections than the default budget allows in one window. A
		// never-fetched entry has no last-known accounts to be served from, so
		// deferring it would drop the profile off the answer entirely.
		const selections = Array.from(
			{ length: BUDGET_MAX_REQUESTS + 3 },
			(_, index) => `/profiles/${index}`,
		);
		const h = harness({ claudeSelections: selections });

		const first = await h.store.read({ agents: ["claude"] });

		expect(first).toHaveLength(selections.length);
		expect(h.calls).toHaveLength(selections.length);
		expect(first.map((a) => a.selection).sort()).toEqual([...selections].sort());
	});

	it("serves grok and antigravity as group entries and never schedules them", async () => {
		const h = harness();
		const accounts = await h.store.read();
		expect(accounts.map((a) => a.agent)).toContain("grok");
		expect(accounts.map((a) => a.agent)).toContain("agy");

		h.advance(2 * QUOTA_TTL_MS);
		await h.store.refreshDue(h.now, {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		});
		expect(h.callsFor("grok")).toHaveLength(1);
		expect(h.callsFor("agy")).toHaveLength(1);
	});
});

describe("QuotaStore discovery", () => {
	it("adds new profiles, reaps removed ones, and carries signed-out and API-key rows", async () => {
		const h = harness({
			claudeSelections: [null],
			claudeStatic: [
				account("claude", "/profiles/out", {
					status: "signed_out",
					statusDetail: "Signed out",
					windows: [],
				}),
				account("claude", "/profiles/key", {
					credentialKind: "api_key",
					windows: [],
				}),
			],
		});

		const first = await h.store.read({ agents: ["claude"] });
		expect(first.map((a) => a.selection).sort()).toEqual([
			"/profiles/key",
			"/profiles/out",
			null,
		] as Array<string | null>);
		// Static rows have no fetch of their own.
		expect(h.calls).toHaveLength(1);

		h.state.claudeSelections = [null, "/profiles/a"];
		h.advance(QUOTA_TTL_MS);
		const second = await h.store.read({ agents: ["claude"] });
		expect(second.map((a) => a.selection)).toContain("/profiles/a");

		h.state.claudeSelections = [null];
		h.state.claudeStatic = [];
		h.advance(QUOTA_TTL_MS);
		const third = await h.store.read({ agents: ["claude"] });
		expect(third.map((a) => a.selection)).toEqual([null]);
		expect(h.store.entry(CLAUDE_A)).toBeUndefined();
	});

	// The Switch sign-in flow puts a credential back into a profile that was
	// carried as a signed-out static row; without re-arming it, the row keeps
	// its signed-out numbers (and its "cannot be switched onto") until restart.
	it("re-arms a static row once discovery lists it as a signed-in selection", async () => {
		const h = harness({
			claudeSelections: [null],
			claudeStatic: [
				account("claude", "/profiles/a", {
					status: "signed_out",
					statusDetail: "Signed out",
					windows: [],
				}),
			],
		});
		await h.store.read({ agents: ["claude"] });
		expect(requireEntry(h.store, CLAUDE_A).fetchable).toBe(false);
		expect(h.callsFor(CLAUDE_A)).toHaveLength(0);

		h.state.claudeStatic = [];
		h.state.claudeSelections = [null, "/profiles/a"];
		h.advance(DISCOVERY_INTERVAL_MS);
		const accounts = await h.store.read({ agents: ["claude"] });

		expect(h.callsFor(CLAUDE_A)).toHaveLength(1);
		expect(
			accounts.find((entry) => entry.selection === "/profiles/a")?.status,
		).toBe("ok");
	});

	// A fetch and the discovery pass overlap: the pass carried the profile whole
	// as a signed-out row while the fetch was in flight, and that fetch — asking
	// about a credential that is already gone — answers with no account. Writing
	// it back emptied the row, so the profile vanished from the Usage page (no
	// signed-out card, so no Switch sign-in and no Remove) until the next pass.
	it("keeps a static row a discovery pass installed while a fetch was in flight", async () => {
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const h = harness({
			claudeSelections: [null, "/profiles/a"],
			respondClaude: async (selection) => {
				if (selection !== "/profiles/a") {
					return { account: account("claude", selection), rateLimited: false };
				}
				await gate;
				return { account: null, rateLimited: false };
			},
		});

		const inflight = h.store.read({ agents: ["claude"] });
		// Let the batch reach the entry before the discovery pass runs.
		await new Promise((resolve) => setTimeout(resolve, 0));

		h.state.claudeSelections = [null];
		h.state.claudeStatic = [
			account("claude", "/profiles/a", {
				status: "signed_out",
				statusDetail: "Signed out",
				windows: [],
			}),
		];
		await h.store.read({ agents: ["claude"], forceRefresh: true });
		expect(requireEntry(h.store, CLAUDE_A).tokenState).toBe("signed_out");

		release();
		await inflight;

		const entry = requireEntry(h.store, CLAUDE_A);
		expect(entry.tokenState).toBe("signed_out");
		expect(entry.accounts).toHaveLength(1);
		expect(entry.nextPollAt).toBe(Number.POSITIVE_INFINITY);
		const accounts = await h.store.read({ agents: ["claude"] });
		expect(accounts.map((a) => a.selection).sort()).toEqual([
			"/profiles/a",
			null,
		] as Array<string | null>);
	});

	// discoverClaudeProfiles abandons its walk once the scan-time budget runs
	// out, so a short list is not proof a profile is gone.
	it("reaps nothing from a pass that reports itself incomplete", async () => {
		const h = harness({ claudeSelections: [null, "/profiles/a"] });
		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_A)).toBeDefined();

		h.state.claudeSelections = [null];
		h.state.claudeComplete = false;
		h.advance(QUOTA_TTL_MS);
		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_A)).toBeDefined();

		// The next complete pass reaps it as before.
		h.state.claudeComplete = true;
		h.advance(QUOTA_TTL_MS);
		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_A)).toBeUndefined();
	});

	// KTD4: two dirs holding one login collapse to one row, and only this pass
	// sees the dropped one — the fetch that rebuilds the row reads a single
	// selection, so without the entry keeping it nothing can offer to remove
	// the profile it left on disk.
	it("carries the dirs the dedupe dropped onto the entry and its fetched row", async () => {
		const h = harness({ claudeSelections: [null] });
		h.state.claudeDuplicateSelections = { [CLAUDE_DEFAULT]: ["/profiles/b"] };

		const accounts = await h.store.read({ agents: ["claude"] });

		expect(requireEntry(h.store, CLAUDE_DEFAULT).duplicateSelections).toEqual([
			"/profiles/b",
		]);
		expect(accounts[0]?.duplicateSelections).toEqual(["/profiles/b"]);

		// A pass that no longer reports the dir clears it off the row.
		h.state.claudeDuplicateSelections = {};
		h.advance(DISCOVERY_INTERVAL_MS);
		const refreshed = await h.store.read({ agents: ["claude"] });

		expect(
			requireEntry(h.store, CLAUDE_DEFAULT).duplicateSelections,
		).toBeUndefined();
		expect(refreshed[0]?.duplicateSelections).toBeUndefined();
	});
});

describe("QuotaStore adaptive cadence", () => {
	// AE11: three in-rotation accounts at a 1-minute interval.
	it("polls the active entry every minute and the others every five minutes", async () => {
		const h = harness({
			claudeSelections: [null, "/profiles/a", "/profiles/b"],
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		for (let minute = 0; minute <= 10; minute++) {
			await h.store.refreshDue(h.now, schedule);
			h.advance(MINUTE);
		}

		expect(h.callsFor(CLAUDE_DEFAULT).length).toBeGreaterThanOrEqual(8);
		expect(h.callsFor(CLAUDE_A).length).toBeGreaterThanOrEqual(2);
		expect(h.callsFor(CLAUDE_A).length).toBeLessThanOrEqual(3);
		expect(h.callsFor(CLAUDE_B).length).toBeGreaterThanOrEqual(2);
		expect(h.callsFor(CLAUDE_B).length).toBeLessThanOrEqual(3);
	});

	it("keeps every five-minute window inside the per-endpoint budget", async () => {
		const h = harness({
			claudeSelections: [null, "/profiles/a", "/profiles/b"],
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};
		for (let minute = 0; minute <= 20; minute++) {
			await h.store.refreshDue(h.now, schedule);
			h.advance(MINUTE);
		}
		for (const call of h.calls) {
			const inWindow = h.calls.filter(
				(other) => other.at > call.at - 5 * MINUTE && other.at <= call.at,
			);
			expect(inWindow.length).toBeLessThanOrEqual(budgetMaxRequests(MINUTE));
		}
	});

	// read() serves the Usage page, and it recorded its requests into the same
	// window refreshDue reads — so a Refresh on a many-profile host fired one
	// request per stale entry at once, which is both the burst that earns a 429
	// and the reason the active account's own poll then slipped a whole window.
	it("keeps a Usage-page refresh inside the per-endpoint budget", async () => {
		const h = harness({
			claudeSelections: [
				null,
				"/profiles/a",
				"/profiles/b",
				"/profiles/c",
				"/profiles/d",
				"/profiles/e",
				"/profiles/f",
				"/profiles/g",
				"/profiles/h",
			],
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};
		// Teach the store the cadence, so read() knows which entry is active,
		// then let the window clear so the refresh has the full budget.
		await h.store.refreshDue(h.now, schedule);
		h.advance(6 * MINUTE);
		const primed = h.calls.length;

		await h.store.read({ agents: ["claude"], forceRefresh: true });

		const burst = h.calls.slice(primed);
		expect(burst.length).toBeLessThanOrEqual(budgetMaxRequests(MINUTE));
		// Nine selections are stale; the cap is what stops all nine going out.
		expect(burst.length).toBeLessThan(9);
		// The account sessions run on is the one that must not be withheld.
		expect(burst.some((call) => call.key === CLAUDE_DEFAULT)).toBe(true);
	});

	// A row re-armed while the endpoint is backed off must inherit that
	// back-off: probing early earns a fresh 429 and pushes every other
	// account's recovery out by the whole interval again.
	it("re-arms a signed-out row behind the endpoint back-off", async () => {
		const h = harness({
			claudeSelections: [null],
			claudeStatic: [
				account("claude", "/profiles/a", { status: "signed_out", windows: [] }),
			],
			respondClaude: async (selection) => ({
				account: account("claude", selection, {
					status: "unavailable",
					statusDetail: "Usage endpoint returned 429.",
					windows: [],
				}),
				rateLimited: true,
			}),
		});

		await h.store.read({ agents: ["claude"], forceRefresh: true });
		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBeGreaterThan(0);

		// The Switch sign-in flow restores the credential, so the next
		// discovery pass lists the static row as a fetchable selection again.
		h.state.claudeSelections = [null, "/profiles/a"];
		h.state.claudeStatic = [];
		h.advance(MINUTE);
		const before = h.calls.length;
		await h.store.read({ agents: ["claude"], forceRefresh: true });

		const rearmedKey = quotaEntryKey("claude", "/profiles/a");
		expect(h.calls.slice(before).map((call) => call.key)).not.toContain(
			rearmedKey,
		);
		expect(requireEntry(h.store, rearmedKey).backoffMs).toBeGreaterThan(0);
	});

	// The budget is what the configured cadence costs plus a couple of slots
	// for the other accounts; a flat six would silently cap a 30-second poll at
	// four requests per window and never honour the setting at all.
	it("honours a 30-second active cadence across a five-minute window", async () => {
		const h = harness({
			claudeSelections: [null, "/profiles/a", "/profiles/b"],
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: 30_000 },
		};

		for (let step = 0; step < 10; step++) {
			await h.store.refreshDue(h.now, schedule);
			h.advance(30_000);
		}

		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(10);
		// The secondary accounts still got their slot in the same window.
		expect(h.callsFor(CLAUDE_A)).toHaveLength(1);
		expect(h.callsFor(CLAUDE_B)).toHaveLength(1);
	});

	it("scales the budget with the interval and never drops below the floor", () => {
		expect(budgetMaxRequests(30_000)).toBe(12);
		expect(budgetMaxRequests(MINUTE)).toBe(7);
		expect(budgetMaxRequests(5 * MINUTE)).toBe(BUDGET_MAX_REQUESTS);
		expect(budgetMaxRequests(undefined)).toBe(BUDGET_MAX_REQUESTS);
	});

	// R14/R17: pressing Refresh on the Usage page runs a batch with no
	// schedule of its own; it must not push the active account's next poll out
	// to the idle five minutes.
	it("keeps the engine's cadence through an on-demand refresh", async () => {
		const h = harness({ claudeSelections: [null, "/profiles/a"] });
		await h.store.refreshDue(h.now, {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: 30_000 },
		});

		h.advance(MINUTE);
		await h.store.read({ agents: ["claude"], forceRefresh: true });

		expect(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt).toBe(
			h.now + 30_000,
		);
		expect(requireEntry(h.store, CLAUDE_A).nextPollAt).toBe(
			h.now + IDLE_POLL_MS,
		);
	});

	it("polls exhausted entries about every ten minutes", async () => {
		const h = harness({
			claudeSelections: [null, "/profiles/a"],
			respondClaude: async (selection) => ({
				account: account("claude", selection, {
					windows: [
						{
							id: "five_hour",
							label: "Session (5h)",
							usedPercent: 100,
							resetsAt: null,
						},
					],
				}),
				rateLimited: false,
			}),
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};
		await h.store.refreshDue(h.now, schedule);
		const entry = h.store.entry(CLAUDE_A);
		expect(entry?.nextPollAt).toBe(h.now + 10 * MINUTE);
	});

	// R22: `nearestReset` never filters out a reset that has already gone by,
	// and a failing or stale fetch leaves the old windows in the pool — so a
	// latched agent hands the same elapsed wake to every tick. Clamping that to
	// `now + 1` polled an already-exhausted endpoint on every one of them.
	it("ignores a wake time that has already passed", async () => {
		const h = harness({ claudeSelections: [null] });
		const schedule = {
			claude: {
				activeKey: CLAUDE_DEFAULT,
				intervalMs: EXHAUSTED_POLL_MS,
				wakeAt: T0 - MINUTE,
			},
		};

		await h.store.refreshDue(h.now, schedule);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt).toBe(
			h.now + EXHAUSTED_POLL_MS,
		);

		h.advance(MINUTE);
		await h.store.refreshDue(h.now, schedule);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
	});

	it("still wakes at a reset ahead of it, then returns to the cadence", async () => {
		const h = harness({ claudeSelections: [null] });
		const wakeAt = T0 + 2 * MINUTE;
		const schedule = {
			claude: {
				activeKey: CLAUDE_DEFAULT,
				intervalMs: EXHAUSTED_POLL_MS,
				wakeAt,
			},
		};

		await h.store.refreshDue(h.now, schedule);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt).toBe(wakeAt);

		h.advance(2 * MINUTE);
		await h.store.refreshDue(h.now, schedule);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(2);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt).toBe(
			h.now + EXHAUSTED_POLL_MS,
		);
	});

	it("defers non-active entries first when the schedule exceeds the budget", async () => {
		// One more account than the endpoint budget allows in one pass.
		const budget = budgetMaxRequests(MINUTE);
		const selections = Array.from(
			{ length: budget },
			(_, index) => `/profiles/${index}`,
		);
		const h = harness({ claudeSelections: [null, ...selections] });

		await h.store.refreshDue(h.now, {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		});

		expect(h.calls).toHaveLength(budget);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
		const deferred = h.store
			.entries("claude")
			.filter((entry) => entry.fetchedAt === null);
		expect(deferred).toHaveLength(1);
		expect(deferred[0]?.key).not.toBe(CLAUDE_DEFAULT);
		expect(deferred[0]?.nextPollAt).toBeGreaterThan(h.now);
	});

	// The deferred entry lands on the same nextPollAt as the ones just fetched
	// — the request window is empty by then, so deferForBudget resolves to now
	// plus a window — and a stable sort handed the slots back to the same
	// winners every round. The last profile was then never fetched at all:
	// missing from the Usage page, never scored, never a switch target.
	it("eventually fetches every selection when they outnumber the budget", async () => {
		const budget = budgetMaxRequests(MINUTE);
		const h = harness({
			claudeSelections: [
				null,
				...Array.from({ length: budget }, (_, index) => `/profiles/${index}`),
			],
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};
		const last = quotaEntryKey("claude", `/profiles/${budget - 1}`);

		// Half an hour of the engine's 30-second tick.
		for (let tick = 0; tick < 60; tick++) {
			await h.store.refreshDue(h.now, schedule);
			h.advance(30_000);
		}

		expect(requireEntry(h.store, last).fetchedAt).not.toBeNull();
		expect(
			h.store
				.entries("claude")
				.filter((entry) => entry.fetchedAt === null)
				.map((entry) => entry.key),
		).toEqual([]);
	});

	// The same tie on the Usage page's Refresh: the never-fetched profile shares
	// its nextPollAt with the entries the tick just read, so without the
	// tiebreak the budget goes to those and it is left out of the batch again.
	it("spends a forced refresh's budget on the never-fetched profile first", async () => {
		const budget = budgetMaxRequests(MINUTE);
		const h = harness({
			claudeSelections: [
				null,
				...Array.from({ length: budget }, (_, index) => `/profiles/${index}`),
			],
		});

		await h.store.refreshDue(h.now, {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		});
		const starved = h.store
			.entries("claude")
			.find((entry) => entry.fetchedAt === null);
		expect(starved).toBeDefined();

		h.advance(QUOTA_TTL_MS);
		await h.store.read({ agents: ["claude"], forceRefresh: true });

		expect(starved?.fetchedAt).not.toBeNull();
	});
});

describe("QuotaStore back-off", () => {
	it("backs off every entry on the endpoint after a 429 and doubles to the cap", async () => {
		let rateLimited = true;
		const h = harness({
			claudeSelections: [null, "/profiles/a"],
			respondClaude: async (selection) => {
				if (selection === "/profiles/a" && rateLimited) {
					return {
						account: account("claude", selection, {
							status: "unavailable",
							statusDetail: "Usage endpoint returned 429.",
							windows: [],
						}),
						rateLimited: true,
					};
				}
				return { account: account("claude", selection), rateLimited: false };
			},
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		await h.store.refreshDue(h.now, schedule);
		// A 429 on one account backs off every entry on that endpoint.
		expect(h.store.entry(CLAUDE_A)?.backoffMs).toBe(MINUTE);
		expect(h.store.entry(CLAUDE_DEFAULT)?.backoffMs).toBe(MINUTE);

		const seen: number[] = [];
		for (let round = 0; round < 6; round++) {
			const next = h.store.entry(CLAUDE_A)?.nextPollAt ?? h.now;
			h.advance(next - h.now);
			await h.store.refreshDue(h.now, schedule);
			seen.push(h.store.entry(CLAUDE_A)?.backoffMs ?? 0);
		}
		expect(seen).toEqual([
			2 * MINUTE,
			4 * MINUTE,
			8 * MINUTE,
			16 * MINUTE,
			MAX_BACKOFF_MS,
			MAX_BACKOFF_MS,
		]);

		// Recovery: a clean tick clears the endpoint back-off.
		rateLimited = false;
		const next = h.store.entry(CLAUDE_A)?.nextPollAt ?? h.now;
		h.advance(next - h.now);
		await h.store.refreshDue(h.now, schedule);
		expect(h.store.entry(CLAUDE_A)?.backoffMs).toBe(0);
		expect(h.store.entry(CLAUDE_DEFAULT)?.nextPollAt).toBe(h.now + MINUTE);
	});

	// KTD10: the Usage page refetches every five minutes and its Refresh
	// button forces a read; both would otherwise walk straight through a
	// back-off the engine's tick is respecting, since the TTL knows nothing
	// about it.
	it("sends nothing from read while the endpoint is backing off, and still serves the last-known accounts", async () => {
		let rateLimited = true;
		const h = harness({
			claudeSelections: [null, "/profiles/a"],
			respondClaude: async (selection) => {
				if (selection === "/profiles/a" && rateLimited) {
					return {
						account: account("claude", selection, {
							status: "unavailable",
							statusDetail: "Usage endpoint returned 429.",
							windows: [],
						}),
						rateLimited: true,
					};
				}
				return { account: account("claude", selection), rateLimited: false };
			},
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		// Climb the ladder until the back-off outlasts the TTL, so a read
		// inside it is stale by the TTL and forbidden by the back-off.
		await h.store.refreshDue(h.now, schedule);
		for (let round = 0; round < 3; round++) {
			h.advance(requireEntry(h.store, CLAUDE_A).nextPollAt - h.now);
			await h.store.refreshDue(h.now, schedule);
		}
		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBe(8 * MINUTE);
		const sent = h.calls.length;

		h.advance(QUOTA_TTL_MS);
		const stale = await h.store.read({ agents: ["claude"] });
		expect(h.calls).toHaveLength(sent);
		expect(stale).toHaveLength(2);
		expect(
			stale.find((entry) => entry.selection === null)?.windows[0]?.usedPercent,
		).toBe(10);

		const forced = await h.store.read({
			agents: ["claude"],
			forceRefresh: true,
		});
		expect(h.calls).toHaveLength(sent);
		expect(forced).toHaveLength(2);

		// Once the back-off has run out the on-demand path fetches as before.
		rateLimited = false;
		h.advance(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt - h.now);
		await h.store.read({ agents: ["claude"] });
		expect(h.calls).toHaveLength(sent + 2);
	});

	// A profile discovered mid-back-off is due immediately if it is seeded at
	// zero, and its success would then clear a ladder it never sat out.
	it("holds a profile discovered mid-back-off and keeps the endpoint's ladder", async () => {
		let rateLimited = true;
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) => {
				if (rateLimited) {
					return {
						account: account("claude", selection, {
							status: "unavailable",
							statusDetail: "Usage endpoint returned 429.",
							windows: [],
						}),
						rateLimited: true,
					};
				}
				return { account: account("claude", selection), rateLimited: false };
			},
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		await h.store.refreshDue(h.now, schedule);
		for (let round = 0; round < 3; round++) {
			h.advance(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt - h.now);
			await h.store.refreshDue(h.now, schedule);
		}
		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBe(8 * MINUTE);

		// The endpoint has recovered, but nothing knows that yet: the new
		// profile must not be the one to find out.
		rateLimited = false;
		h.state.claudeSelections = [null, "/profiles/a"];
		h.advance(DISCOVERY_INTERVAL_MS);
		await h.store.refreshDue(h.now, schedule);

		expect(h.callsFor(CLAUDE_A)).toHaveLength(0);
		expect(requireEntry(h.store, CLAUDE_A).backoffMs).toBe(8 * MINUTE);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBe(8 * MINUTE);

		// The entry that did sit the back-off out ends it.
		h.advance(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt - h.now);
		await h.store.refreshDue(h.now, schedule);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBe(0);
	});

	// A 429 makes every entry on the endpoint wait, but assigning the new
	// nextPollAt outright pulled entries that were waiting longer *forward* —
	// so one rate-limited selection produced a burst at the very endpoint that
	// had just asked for a pause.
	it("never pulls another entry's poll earlier when one selection is 429ed", async () => {
		let rateLimited = false;
		const h = harness({
			claudeSelections: [null, "/profiles/a", "/profiles/b"],
			respondClaude: async (selection) => ({
				account: account("claude", selection, {
					windows: [
						{
							id: "five_hour",
							label: "Session (5h)",
							usedPercent: 100,
							resetsAt: null,
						},
					],
				}),
				rateLimited: rateLimited && selection === null,
			}),
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		await h.store.refreshDue(h.now, schedule);
		// Both secondaries are spent, so they are not due for ten minutes.
		expect(requireEntry(h.store, CLAUDE_A).nextPollAt).toBe(
			T0 + EXHAUSTED_POLL_MS,
		);

		rateLimited = true;
		h.advance(MINUTE);
		await h.store.refreshDue(h.now, schedule);

		expect(requireEntry(h.store, CLAUDE_A).nextPollAt).toBe(
			T0 + EXHAUSTED_POLL_MS,
		);
		expect(requireEntry(h.store, CLAUDE_B).nextPollAt).toBe(
			T0 + EXHAUSTED_POLL_MS,
		);

		// A minute later only the account sessions run on is due.
		const sent = h.calls.length;
		h.advance(MINUTE);
		await h.store.refreshDue(h.now, schedule);
		expect(h.calls.slice(sent).map((call) => call.key)).toEqual([
			CLAUDE_DEFAULT,
		]);
	});

	// Both entry points are live on one store: the engine's tick and the Usage
	// page's Refresh. The second one to arrive joins the entry's in-flight
	// fetch, and if it voted on the outcome too, one 429 would spend two rungs
	// of the ladder — [2, 8, 30, 30] instead of [1, 2, 4, 8].
	it("advances the ladder one rung per 429 when a refresh joins the tick's fetch", async () => {
		let release = () => {};
		let gate = Promise.resolve();
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) => {
				await gate;
				return {
					account: account("claude", selection, {
						status: "unavailable",
						statusDetail: "Usage endpoint returned 429.",
						windows: [],
					}),
					rateLimited: true,
				};
			},
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		const seen: number[] = [];
		for (let round = 0; round < 4; round++) {
			gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const tick = h.store.refreshDue(h.now, schedule);
			const refresh = h.store.read({ agents: ["claude"], forceRefresh: true });
			// Let both batches reach the entry before the one request settles.
			await new Promise((resolve) => setTimeout(resolve, 0));
			release();
			await Promise.all([tick, refresh]);
			seen.push(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs);
			h.advance(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt - h.now);
		}

		// One request per round: the refresh really did join, so each rung was
		// decided by a single 429.
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(4);
		expect(seen).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE, 8 * MINUTE]);
	});
});

describe("QuotaStore resilience", () => {
	// AE10: a failing fetch keeps the last-known numbers.
	it("keeps the last-known accounts, sets lastError and reports not switchable", async () => {
		let failing = false;
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) => {
				if (failing) throw new Error("network down");
				return { account: account("claude", selection), rateLimited: false };
			},
		});

		await h.store.read({ agents: ["claude"] });
		const fetchedAt = h.store.entry(CLAUDE_DEFAULT)?.fetchedAt;

		failing = true;
		h.advance(QUOTA_TTL_MS);
		const accounts = await h.store.read({ agents: ["claude"] });

		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.windows[0]?.usedPercent).toBe(10);
		const entry = h.store.entry(CLAUDE_DEFAULT);
		expect(entry?.lastError).toContain("network down");
		expect(entry?.fetchedAt).toBe(fetchedAt ?? 0);
		expect(eligibleForSwitch(requireEntry(h.store, CLAUDE_DEFAULT))).toBe(
			false,
		);

		// A rejected fetch is not cached: the next read retries.
		failing = false;
		const recovered = await h.store.read({ agents: ["claude"] });
		expect(recovered).toHaveLength(1);
		expect(h.store.entry(CLAUDE_DEFAULT)?.lastError).toBeNull();
		expect(eligibleForSwitch(requireEntry(h.store, CLAUDE_DEFAULT))).toBe(true);
	});

	// R23 token states.
	it("keeps last-known windows for a stale token and stays eligible", async () => {
		let stale = false;
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) => ({
				account: stale
					? account("claude", selection, {
							status: "token_stale",
							statusDetail: "Refreshes when Claude Code next runs.",
							windows: [],
						})
					: account("claude", selection),
				rateLimited: false,
			}),
		});

		await h.store.read({ agents: ["claude"] });
		stale = true;
		h.advance(QUOTA_TTL_MS);
		const accounts = await h.store.read({ agents: ["claude"] });

		expect(accounts[0]?.status).toBe("token_stale");
		expect(accounts[0]?.windows[0]?.usedPercent).toBe(10);
		const entry = h.store.entry(CLAUDE_DEFAULT);
		expect(entry?.tokenState).toBe("token_stale");
		expect(eligibleForSwitch(requireEntry(h.store, CLAUDE_DEFAULT))).toBe(true);
	});

	// A re-login puts a different provider account behind the same profile
	// dir. The new account must start empty rather than inherit the previous
	// account's windows, extra usage and credits.
	it("carries nothing when a re-login changes the provider account id", async () => {
		let reAuthed = false;
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) => ({
				account: reAuthed
					? account("claude", selection, {
							accountId: "acct-b",
							status: "token_stale",
							statusDetail: "Refreshes when Claude Code next runs.",
							windows: [],
						})
					: account("claude", selection, {
							accountId: "acct-a",
							extraUsage: { usedCents: 500, limitCents: 2000 },
							creditsBalance: 12,
						}),
				rateLimited: false,
			}),
		});

		await h.store.read({ agents: ["claude"] });
		reAuthed = true;
		h.advance(QUOTA_TTL_MS);
		const accounts = await h.store.read({ agents: ["claude"] });

		expect(accounts[0]?.accountId).toBe("acct-b");
		expect(accounts[0]?.windows).toEqual([]);
		expect(accounts[0]?.extraUsage).toBeNull();
		expect(accounts[0]?.creditsBalance).toBeNull();
	});

	it("reports an expired or signed-out account as ineligible", async () => {
		const h = harness({
			claudeSelections: [null],
			claudeStatic: [
				account("claude", "/profiles/out", {
					status: "signed_out",
					statusDetail: "Signed out",
					windows: [],
				}),
			],
			respondClaude: async (selection) => ({
				account: account("claude", selection, {
					status: "token_expired",
					statusDetail: "Sign-in expired",
					windows: [],
				}),
				rateLimited: false,
			}),
		});

		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_DEFAULT)?.tokenState).toBe("token_expired");
		expect(eligibleForSwitch(requireEntry(h.store, CLAUDE_DEFAULT))).toBe(
			false,
		);
		const signedOut = requireEntry(
			h.store,
			quotaEntryKey("claude", "/profiles/out"),
		);
		expect(signedOut.tokenState).toBe("signed_out");
		expect(eligibleForSwitch(signedOut)).toBe(false);
	});

	// AE10: the fetch came back, but with nothing readable in it. Zero windows
	// score a full 100 headroom, so an eligible "unavailable" entry is the one
	// an automatic switch would pick.
	it("reports an account whose quota could not be read as ineligible", async () => {
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) => ({
				account: account("claude", selection, {
					status: "unavailable",
					statusDetail: "Usage endpoint timed out.",
					windows: [],
				}),
				rateLimited: false,
			}),
		});

		await h.store.read({ agents: ["claude"] });
		const entry = requireEntry(h.store, CLAUDE_DEFAULT);
		expect(entry.tokenState).toBe("unavailable");
		expect(entry.lastError).toBeNull();
		expect(eligibleForSwitch(entry)).toBe(false);
	});

	// Every branch that yields no account for a per-selection row returns before
	// the request — an unreadable credential, a locked keychain — so an empty
	// result is a failure that never threw, and writing it back would drop the
	// account off the Usage page with nothing on screen to explain it.
	it("keeps the last-known accounts when a fetch returns no account at all", async () => {
		let unreadable = false;
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) =>
				unreadable
					? { account: null, rateLimited: false }
					: { account: account("claude", selection), rateLimited: false },
		});

		await h.store.read({ agents: ["claude"] });
		const fetchedAt = requireEntry(h.store, CLAUDE_DEFAULT).fetchedAt;

		unreadable = true;
		h.advance(QUOTA_TTL_MS);
		const accounts = await h.store.read({ agents: ["claude"] });

		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.windows[0]?.usedPercent).toBe(10);
		const entry = requireEntry(h.store, CLAUDE_DEFAULT);
		expect(entry.lastError).not.toBeNull();
		// `fetchedAt` stands still, so the next read retries instead of waiting
		// out the TTL after the credential is readable again.
		expect(entry.fetchedAt).toBe(fetchedAt);

		unreadable = false;
		const recovered = await h.store.read({ agents: ["claude"] });
		expect(recovered).toHaveLength(1);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).lastError).toBeNull();
	});

	// A result that reached no provider is no evidence the endpoint recovered.
	it("does not clear the endpoint back-off with an empty result", async () => {
		let mode: "429" | "unreadable" = "429";
		const h = harness({
			claudeSelections: [null],
			respondClaude: async (selection) =>
				mode === "429"
					? {
							account: account("claude", selection, {
								status: "unavailable",
								statusDetail: "Usage endpoint returned 429.",
								windows: [],
							}),
							rateLimited: true,
						}
					: { account: null, rateLimited: false },
		});
		const schedule = {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		};

		await h.store.refreshDue(h.now, schedule);
		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBe(MINUTE);

		mode = "unreadable";
		h.advance(requireEntry(h.store, CLAUDE_DEFAULT).nextPollAt - h.now);
		await h.store.refreshDue(h.now, schedule);

		expect(requireEntry(h.store, CLAUDE_DEFAULT).backoffMs).toBe(MINUTE);
	});

	// The exemption: a group agent's one row holds every account of that agent,
	// so "no ~/.grok/auth.json" is a correct empty row and must still be written.
	it("writes a group agent's genuinely empty row", async () => {
		const store = new QuotaStore({
			now: () => T0,
			fetchGrok: async () => [],
		});

		const accounts = await store.read({ agents: ["grok"] });

		expect(accounts).toEqual([]);
		const entry = requireEntry(store, quotaEntryKey("grok", null));
		expect(entry.accounts).toEqual([]);
		expect(entry.fetchedAt).toBe(T0);
		expect(entry.lastError).toBeNull();
	});
});

describe("QuotaStore snapshot mirror", () => {
	it("mirrors the entries through onSnapshot", async () => {
		const h = harness({ claudeSelections: [null] });
		await h.store.refreshDue(h.now, {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		});
		const latest = h.snapshots.at(-1);
		expect(latest?.entries.map((entry) => entry.key)).toEqual([CLAUDE_DEFAULT]);
		expect(latest?.entries[0]?.accounts[0]?.selection).toBeNull();
		expect(latest?.entries[0]?.tokenState).toBe("ok");
	});

	// The sink writes the mirror file, so a full or read-only disk throws out of
	// a read whose fetch has already succeeded. The mirror is an optimisation
	// for the other host-services; it is not the answer this read owes.
	it("serves a read whose mirror write threw", async () => {
		const h = harness({ claudeSelections: [null] });
		h.store.setSnapshotSink(() => {
			throw new Error("ENOSPC: no space left on device");
		});

		const accounts = await h.store.read({ agents: ["claude"] });

		expect(accounts).toHaveLength(1);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
	});

	// KTD5: every host-service on the machine builds a store, so a loser that
	// fetched would multiply this machine's provider requests.
	it("serves a lock loser from the owner's mirror and calls no fetcher", async () => {
		const owner = harness({ claudeSelections: [null, "/profiles/a"] });
		await owner.store.read({ agents: ["claude"] });
		// The mirror is JSON on disk by the time a loser reads it.
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;

		const loser = harness({ claudeSelections: [null, "/profiles/a"] });
		loser.store.setSnapshotSource(() => published);

		const accounts = await loser.store.read({
			agents: ["claude"],
			forceRefresh: true,
		});

		expect(accounts.map((entry) => entry.selection)).toEqual([
			null,
			"/profiles/a",
		]);
		// The dates survive the round trip: the Usage page renders them.
		expect(accounts[0]?.fetchedAt).toBeInstanceOf(Date);
		expect(loser.calls).toEqual([]);
	});

	// quota.json outlives the owner that wrote it: an owner that departed, or
	// one whose auto-switch is off and never republishes, would otherwise keep
	// answering for this host with the accounts it happened to see last.
	it("reads for itself once the owner's mirror has gone stale", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;

		// A second profile appeared on this machine after the owner published.
		const loser = harness({ claudeSelections: [null, "/profiles/a"] });
		loser.store.setSnapshotSource(() => published);

		// Inside the bound the mirror is still the answer.
		const mirrored = await loser.store.read({ agents: ["claude"] });
		expect(mirrored.map((entry) => entry.selection)).toEqual([null]);
		expect(loser.calls).toEqual([]);

		loser.advance(MIRROR_MAX_AGE_MS + 1);
		const local = await loser.store.read({ agents: ["claude"] });

		expect(local.map((entry) => entry.selection)).toEqual([
			null,
			"/profiles/a",
		]);
		expect(loser.calls.map((call) => call.key)).toEqual([
			CLAUDE_DEFAULT,
			CLAUDE_A,
		]);
	});

	// An owner with auto-switch off polls nothing and publishes nothing, which
	// is not the same as "this machine has no accounts": a loser that took the
	// missing mirror for an answer would show an empty Usage page for good.
	it("reads for itself while the owner has published nothing", async () => {
		const h = harness({ claudeSelections: [null] });
		await h.store.read({ agents: ["claude"] });
		const before = h.calls.length;
		h.store.setSnapshotSource(() => null);

		// Inside the TTL the entries it already has still answer.
		const cached = await h.store.read({ agents: ["claude"] });
		expect(cached.map((entry) => entry.selection)).toEqual([null]);
		expect(h.calls).toHaveLength(before);

		h.advance(2 * QUOTA_TTL_MS);
		const refreshed = await h.store.read({ agents: ["claude"] });

		expect(refreshed.map((entry) => entry.selection)).toEqual([null]);
		expect(h.calls).toHaveLength(before + 1);
	});

	it("discovers and fetches when the mirror holds nothing for the agent", async () => {
		const h = harness({ claudeSelections: [null, "/profiles/a"] });
		// The owner mirrors another agent entirely — nothing for Claude.
		h.store.setSnapshotSource(() => ({
			writtenAt: T0,
			entries: [
				{
					key: "grok",
					agent: "grok",
					selection: null,
					accounts: [],
					fetchedAt: T0,
					tokenState: "ok",
					lastError: null,
				},
			],
		}));

		const accounts = await h.store.read({ agents: ["claude"] });

		expect(accounts.map((entry) => entry.selection)).toEqual([
			null,
			"/profiles/a",
		]);
		expect(h.calls).toHaveLength(2);
	});

	// An owner polling Claude with Codex auto-switch off publishes Claude
	// alone. Taking that partial mirror for the whole answer would hide every
	// Codex account from this host until the owner enabled Codex too.
	it("serves the mirrored agent and reads the uncovered one for itself", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;

		const loser = harness({
			claudeSelections: [null],
			codexSelections: ["/profiles/codex"],
		});
		loser.store.setSnapshotSource(() => published);

		const accounts = await loser.store.read({ agents: ["claude", "codex"] });

		expect(accounts.map((entry) => [entry.agent, entry.selection])).toEqual([
			["claude", null],
			["codex", "/profiles/codex"],
		]);
		// Claude came from the mirror; only the uncovered agent was fetched.
		expect(loser.calls.map((call) => call.key)).toEqual([
			quotaEntryKey("codex", "/profiles/codex"),
		]);
	});

	// The mirror is JSON another process wrote; one bad row must not fail
	// every Usage query on this host. The accounts behind the dropped row are
	// not in the mirror's answer either, so the agent is uncovered exactly as a
	// stale row's is and this host reads it for itself — otherwise
	// `/profiles/a` would vanish here for as long as the owner republished it.
	it("drops a malformed mirror entry and re-reads that agent locally", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;
		published.entries.unshift({
			key: "claude:/profiles/a",
			agent: "claude",
			selection: "/profiles/a",
			accounts: [null as unknown as UsageAccount],
			fetchedAt: T0,
			tokenState: "ok",
			lastError: null,
		});

		const loser = harness({ claudeSelections: [null, "/profiles/a"] });
		loser.store.setSnapshotSource(() => published);

		const accounts = await loser.store.read({ agents: ["claude"] });

		expect(accounts.map((entry) => entry.selection)).toEqual([
			null,
			"/profiles/a",
		]);
		expect(loser.calls.map((call) => call.key)).toEqual([
			quotaEntryKey("claude", null),
			quotaEntryKey("claude", "/profiles/a"),
		]);
	});

	// A row that is not an object at all: reading `entry.agent` throws, and the
	// catch must not throw again reading it a second time, or the whole read
	// fails on this host.
	it("survives a null mirror row", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;
		published.entries.unshift(
			null as unknown as QuotaStoreSnapshot["entries"][number],
		);

		const loser = harness({ claudeSelections: [null] });
		loser.store.setSnapshotSource(() => published);

		const accounts = await loser.store.read({ agents: ["claude"] });

		expect(accounts.map((entry) => entry.selection)).toEqual([null]);
	});

	it("fetches again once it owns the lock", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;

		const h = harness({ claudeSelections: [null] });
		h.store.setSnapshotSource(() => published);
		await h.store.read({ agents: ["claude"] });
		expect(h.calls).toEqual([]);

		h.store.setSnapshotSource(null);
		await h.store.read({ agents: ["claude"] });

		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
	});

	// `writtenAt` is refreshed by every emitSnapshot, including ones another
	// agent's poll triggered, so a row the owner never repolls — grok and
	// antigravity are not AccountAgents, so `refreshDue` cannot reach them —
	// rode a fresh snapshot forever with its original numbers, and not even a
	// forced refresh could break out.
	it("reads for itself when a mirror row is stale inside a fresh snapshot", async () => {
		const h = harness();
		h.store.setSnapshotSource(() => ({
			// The snapshot is seconds old; the row inside it is hours old.
			writtenAt: h.now - 5_000,
			entries: [
				{
					key: "grok",
					agent: "grok",
					selection: null,
					accounts: [
						account("grok", null, {
							windows: [
								{
									id: "five_hour",
									label: "Session (5h)",
									usedPercent: 5,
									resetsAt: null,
								},
							],
						}),
					],
					fetchedAt: h.now - (MIRROR_MAX_AGE_MS + 1),
					tokenState: "ok",
					lastError: null,
				},
			],
		}));

		const accounts = await h.store.read({
			agents: ["grok"],
			forceRefresh: true,
		});

		expect(h.calls.map((call) => call.key)).toEqual(["grok"]);
		expect(accounts[0]?.windows[0]?.usedPercent).toBe(10);
	});

	// A row whose own fetch keeps throwing keeps its previous accounts and does
	// not move its fetchedAt (AE10). Counting its agent as covered anyway
	// dropped that account from every non-owner host, with no local read to
	// replace it and no forced refresh to break out, while the owner still
	// showed it.
	it("reads for itself when a mirrored row's fetch has been failing", async () => {
		const owner = harness({
			claudeSelections: [null, "/profiles/a"],
			respondClaude: async (selection) => {
				if (selection === "/profiles/a") throw new Error("endpoint refused");
				return { account: account("claude", selection), rateLimited: false };
			},
		});
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;
		expect(
			published.entries.find((entry) => entry.key === CLAUDE_A)?.fetchedAt,
		).toBeNull();

		const loser = harness({ claudeSelections: [null, "/profiles/a"] });
		loser.store.setSnapshotSource(() => published);

		const accounts = await loser.store.read({ agents: ["claude"] });

		expect(accounts.map((entry) => entry.selection)).toEqual([
			null,
			"/profiles/a",
		]);
		expect(loser.calls.map((call) => call.key)).toEqual([
			CLAUDE_DEFAULT,
			CLAUDE_A,
		]);
	});

	// The likelier trigger: a static row takes its fetchedAt only from the
	// discovery pass, so one local I/O failure strands every one of them at
	// once while the fetchable rows keep republishing a fresh snapshot.
	it("reads for itself when failed discovery stranded a mirrored static row", async () => {
		const signedOut = account("claude", "/profiles/a", {
			status: "signed_out",
			windows: [],
		});
		const owner = harness({
			claudeSelections: [null],
			claudeStatic: [signedOut],
		});
		await owner.store.read({ agents: ["claude"] });

		owner.state.claudeDiscoveryFails = true;
		owner.advance(MIRROR_MAX_AGE_MS + MINUTE);
		await owner.store.read({ agents: ["claude"], forceRefresh: true });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;

		const loser = harness({
			claudeSelections: [null],
			claudeStatic: [signedOut],
		});
		loser.store.setSnapshotSource(() => published);
		loser.advance(MIRROR_MAX_AGE_MS + MINUTE);

		const accounts = await loser.store.read({ agents: ["claude"] });

		expect(accounts.map((entry) => entry.selection)).toEqual([
			null,
			"/profiles/a",
		]);
		expect(loser.calls.map((call) => call.key)).toEqual([CLAUDE_DEFAULT]);
	});

	// The other half of that bound: a row the owner does poll must still be
	// served at the owner's slowest cadence, or every host falls back to
	// fetching for itself and the mirror stops saving requests at all.
	it("serves a mirror row the owner repolled at its slowest cadence", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		// R22's all-exhausted latch is the slowest the owner ever polls, and it
		// republishes each time it does.
		owner.advance(EXHAUSTED_POLL_MS);
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;

		const loser = harness({ claudeSelections: [null] });
		loser.store.setSnapshotSource(() => published);
		loser.advance(EXHAUSTED_POLL_MS);

		const accounts = await loser.store.read({
			agents: ["claude"],
			forceRefresh: true,
		});

		expect(accounts.map((entry) => entry.selection)).toEqual([null]);
		expect(loser.calls).toEqual([]);
	});

	it("uses the on-demand TTL when no schedule names the agent", async () => {
		const h = harness({ claudeSelections: [null] });
		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_DEFAULT)?.nextPollAt).toBe(
			h.now + IDLE_POLL_MS,
		);
	});
});
