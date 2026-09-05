import { describe, expect, it } from "bun:test";
import type {
	QuotaCapableAgent,
	UsageAccount,
} from "../trpc/router/usage/types.ts";
import {
	BUDGET_MAX_REQUESTS,
	eligibleForSwitch,
	IDLE_POLL_MS,
	MAX_BACKOFF_MS,
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
	};
	const calls: Array<{ key: string; at: number }> = [];
	const snapshots: QuotaStoreSnapshot[] = [];
	const store = new QuotaStore({
		now: () => clock,
		discoverClaude: async () => ({
			selections: state.claudeSelections,
			staticAccounts: state.claudeStatic,
		}),
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
			expect(inWindow.length).toBeLessThanOrEqual(BUDGET_MAX_REQUESTS);
		}
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

	it("defers non-active entries first when the schedule exceeds the budget", async () => {
		// One more account than the endpoint budget allows in one pass.
		const selections = Array.from(
			{ length: BUDGET_MAX_REQUESTS },
			(_, index) => `/profiles/${index}`,
		);
		const h = harness({ claudeSelections: [null, ...selections] });

		await h.store.refreshDue(h.now, {
			claude: { activeKey: CLAUDE_DEFAULT, intervalMs: MINUTE },
		});

		expect(h.calls).toHaveLength(BUDGET_MAX_REQUESTS);
		expect(h.callsFor(CLAUDE_DEFAULT)).toHaveLength(1);
		const deferred = h.store
			.entries("claude")
			.filter((entry) => entry.fetchedAt === null);
		expect(deferred).toHaveLength(1);
		expect(deferred[0]?.key).not.toBe(CLAUDE_DEFAULT);
		expect(deferred[0]?.nextPollAt).toBeGreaterThan(h.now);
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

	it("uses the on-demand TTL when no schedule names the agent", async () => {
		const h = harness({ claudeSelections: [null] });
		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_DEFAULT)?.nextPollAt).toBe(
			h.now + IDLE_POLL_MS,
		);
	});
});
