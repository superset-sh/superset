import { describe, expect, it } from "bun:test";
import type {
	QuotaCapableAgent,
	UsageAccount,
} from "../trpc/router/usage/types.ts";
import {
	BUDGET_MAX_REQUESTS,
	budgetMaxRequests,
	DISCOVERY_INTERVAL_MS,
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
	};
	const calls: Array<{ key: string; at: number }> = [];
	const snapshots: QuotaStoreSnapshot[] = [];
	const store = new QuotaStore({
		now: () => clock,
		discoverClaude: async () => ({
			selections: state.claudeSelections,
			staticAccounts: state.claudeStatic,
			complete: state.claudeComplete,
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
	// every Usage query on this host.
	it("drops malformed mirror entries and serves the rest", async () => {
		const owner = harness({ claudeSelections: [null] });
		await owner.store.read({ agents: ["claude"] });
		const published = JSON.parse(
			JSON.stringify(owner.store.snapshot()),
		) as QuotaStoreSnapshot;
		published.entries.unshift({
			key: "claude:/profiles/broken",
			agent: "claude",
			selection: "/profiles/broken",
			accounts: [null as unknown as UsageAccount],
			fetchedAt: T0,
			tokenState: "ok",
			lastError: null,
		});

		const loser = harness({ claudeSelections: [null] });
		loser.store.setSnapshotSource(() => published);

		const accounts = await loser.store.read({ agents: ["claude"] });

		expect(accounts.map((entry) => entry.selection)).toEqual([null]);
		expect(loser.calls).toEqual([]);
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

	it("uses the on-demand TTL when no schedule names the agent", async () => {
		const h = harness({ claudeSelections: [null] });
		await h.store.read({ agents: ["claude"] });
		expect(h.store.entry(CLAUDE_DEFAULT)?.nextPollAt).toBe(
			h.now + IDLE_POLL_MS,
		);
	});
});
