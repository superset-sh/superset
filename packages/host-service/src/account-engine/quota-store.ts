/**
 * The host's quota store (KTD10): one owner of quota fetching, TTL,
 * in-flight coalescing, discovery, back-off and the per-endpoint request
 * budget for every quota-capable agent. It replaces the process-wide
 * 5-minute cache the usage router used to keep.
 *
 * It is constructed unconditionally. With no engine (disabled or sandbox)
 * nothing calls `refreshDue`, so `read` fetches on demand with the 5-minute
 * TTL — the behaviour the Usage page had before, by construction. With the
 * engine running, its tick calls `refreshDue` with a per-agent schedule and
 * the cadence becomes adaptive (R17, R18).
 *
 * The store knows nothing about the ownership lock; the engine tells it which
 * side of the lock it is on. The owner installs a snapshot sink and mirrors
 * its entries into quota.json; a lock loser installs a snapshot source and
 * serves that mirror instead of calling a provider at all (KTD5).
 */

import { fetchAgyAccounts } from "../trpc/router/usage/agy-quota";
import {
	discoverClaudeQuotaTargets,
	fetchClaudeAccountForSelection,
} from "../trpc/router/usage/claude";
import {
	dedupeCodexAccounts,
	discoverCodexQuotaTargets,
	fetchCodexAccountForSelection,
} from "../trpc/router/usage/codex";
import { fetchGrokAccounts } from "../trpc/router/usage/grok-quota";
import type {
	QuotaCapableAgent,
	UsageAccount,
	UsageAccountStatus,
} from "../trpc/router/usage/types";
import type { AccountAgent } from "./types.ts";

/** How long a fetched entry is served without refetching (today's cache). */
export const QUOTA_TTL_MS = 5 * 60_000;
/** How often the per-agent discovery pass re-enumerates selections. */
export const DISCOVERY_INTERVAL_MS = 5 * 60_000;
/** R17: in-rotation accounts that are not the active one. */
export const IDLE_POLL_MS = 5 * 60_000;
/** R17: accounts whose windows are spent. */
export const EXHAUSTED_POLL_MS = 10 * 60_000;
/** First step of the 429 back-off; it doubles from here. */
export const INITIAL_BACKOFF_MS = 60_000;
export const MAX_BACKOFF_MS = 30 * 60_000;
/**
 * The endpoint budget: about one request per minute averaged over five
 * minutes, with enough headroom that a 60-second active interval still
 * leaves the other accounts a slot every window (KTD10).
 */
export const BUDGET_WINDOW_MS = 5 * 60_000;
export const BUDGET_MAX_REQUESTS = 6;
/** Slots held back for the accounts that are not the active one. */
const BUDGET_SECONDARY_SLOTS = 2;

/**
 * The budget for one endpoint at the cadence the engine actually asked for.
 * A flat six would silently cap the configured interval — a 30-second active
 * poll needs ten slots per window on its own — so the cap is whatever that
 * interval costs plus a couple for the secondary accounts, never less than
 * {@link BUDGET_MAX_REQUESTS}.
 */
export function budgetMaxRequests(activeIntervalMs?: number): number {
	if (activeIntervalMs === undefined || activeIntervalMs <= 0) {
		return BUDGET_MAX_REQUESTS;
	}
	return Math.max(
		BUDGET_MAX_REQUESTS,
		Math.ceil(BUDGET_WINDOW_MS / activeIntervalMs) + BUDGET_SECONDARY_SLOTS,
	);
}

/** Mirrors `UsageAccountStatus`: what the last read said about the login. */
export type QuotaTokenState = UsageAccountStatus;

export interface QuotaEntry {
	/** `claude:<selection>`, `codex:default`, `grok`, `agy`. */
	key: string;
	agent: QuotaCapableAgent;
	/** Profile dir; null for the system-default login and group entries. */
	selection: string | null;
	accounts: UsageAccount[];
	fetchedAt: number | null;
	nextPollAt: number;
	backoffMs: number;
	lastError: string | null;
	tokenState: QuotaTokenState;
	/**
	 * False for rows the discovery pass carries whole (signed-out profiles,
	 * API-key profiles): there is no quota endpoint to call for them.
	 */
	fetchable: boolean;
	inflight: Promise<QuotaFetchOutcome> | null;
}

/** One login's quota read plus the rate-limit signal the poller backs off on. */
export interface QuotaFetchResult {
	account: UsageAccount | null;
	rateLimited: boolean;
}

/** What a per-agent discovery pass found. */
export interface QuotaDiscovery {
	/** Logins with a readable credential; null is the system-default login. */
	selections: Array<string | null>;
	/** Rows with no fetch of their own (signed-out, API-key). */
	staticAccounts: UsageAccount[];
	/**
	 * False when the pass stopped early and the result is a subset of what is
	 * really there — `discoverClaudeProfiles` gives up on its scan-time budget
	 * mid-walk, and a truncated list would otherwise reap every profile it did
	 * not reach. Absent means complete, so a producer that cannot be partial
	 * says nothing.
	 */
	complete?: boolean;
}

export interface QuotaStoreSnapshotEntry {
	key: string;
	agent: QuotaCapableAgent;
	selection: string | null;
	accounts: UsageAccount[];
	fetchedAt: number | null;
	tokenState: QuotaTokenState;
	lastError: string | null;
}

export interface QuotaStoreSnapshot {
	entries: QuotaStoreSnapshotEntry[];
}

/** What the engine tick tells the store about one agent (KTD10). */
export interface AgentPollSchedule {
	/** Entry key of the active account, polled at `intervalMs`. */
	activeKey: string | null;
	intervalMs: number;
	/**
	 * R22: while the engine is latched all-exhausted it polls at the slow
	 * cadence, but never past the reset that would end the latch — so it
	 * wakes the moment a window gives quota back. Ignored while an entry is
	 * backing off from a 429: that back-off targets the poller, not the
	 * account, and must not be shortened.
	 */
	wakeAt?: number;
}

export type QuotaRefreshSchedule = Partial<
	Record<AccountAgent, AgentPollSchedule>
>;

export interface QuotaStoreDeps {
	now?: () => number;
	discoverClaude?: () => Promise<QuotaDiscovery>;
	discoverCodex?: () => Promise<QuotaDiscovery>;
	fetchClaude?: (selection: string | null) => Promise<QuotaFetchResult>;
	fetchCodex?: (selection: string | null) => Promise<QuotaFetchResult>;
	fetchGrok?: () => Promise<UsageAccount[]>;
	fetchAgy?: () => Promise<UsageAccount[]>;
	/** KTD5: EngineState's quota writer, passed only by the lock owner. */
	onSnapshot?: (snapshot: QuotaStoreSnapshot) => void;
}

interface QuotaFetchOutcome {
	agent: QuotaCapableAgent;
	ok: boolean;
	rateLimited: boolean;
}

const ALL_AGENTS: QuotaCapableAgent[] = ["claude", "codex", "grok", "agy"];
const GROUP_AGENTS: QuotaCapableAgent[] = ["grok", "agy"];

/** Entry key for one login. Group agents use their agent name as the key. */
export function quotaEntryKey(
	agent: QuotaCapableAgent,
	selection: string | null,
): string {
	if (GROUP_AGENTS.includes(agent)) return agent;
	return `${agent}:${selection ?? "default"}`;
}

/**
 * R23/KTD11: a stale access token still counts as signed in and keeps its
 * last-known windows; an expired or signed-out login is never switched onto.
 * A failing fetch also holds the account back — its numbers are last-known,
 * so it may be scored but must not be moved onto (AE10). `unavailable` is the
 * same case one layer down: the read itself did not land (an endpoint error, a
 * timeout, no windows at all), so an automatic switch would be moving onto
 * quota nobody has read. It stays a *manual* target — the user asking for it
 * is evidence the engine does not have.
 */
export function eligibleForSwitch(entry: QuotaEntry): boolean {
	if (entry.lastError !== null) return false;
	return (
		entry.tokenState !== "token_expired" &&
		entry.tokenState !== "signed_out" &&
		entry.tokenState !== "unavailable"
	);
}

function deriveTokenState(accounts: UsageAccount[]): QuotaTokenState {
	if (accounts.length === 0) return "unavailable";
	if (accounts.some((account) => account.status === "ok")) return "ok";
	return accounts[0]?.status ?? "unavailable";
}

function isExhausted(entry: QuotaEntry): boolean {
	return entry.accounts.some((account) =>
		account.windows.some((window) => window.usedPercent >= 100),
	);
}

/**
 * R23: the CLI refreshes a stale token on its next run, so the quota is
 * unreadable meanwhile — the account keeps the windows the last good read
 * saw instead of dropping to nothing.
 */
function carryLastKnownWindows(
	previous: UsageAccount[],
	account: UsageAccount,
): UsageAccount {
	if (account.status !== "token_stale" || account.windows.length > 0) {
		return account;
	}
	const last = previous.find(
		(candidate) =>
			candidate.accountKey === account.accountKey ||
			candidate.selection === account.selection,
	);
	if (!last || last.windows.length === 0) return account;
	return {
		...account,
		windows: last.windows,
		extraUsage: account.extraUsage ?? last.extraUsage,
		creditsBalance: account.creditsBalance ?? last.creditsBalance,
	};
}

export class QuotaStore {
	private readonly deps: QuotaStoreDeps;
	private readonly now: () => number;
	private readonly entryMap = new Map<string, QuotaEntry>();
	private readonly discoveredAt = new Map<AccountAgent, number>();
	private readonly discoveryInflight = new Map<AccountAgent, Promise<void>>();
	/** Per-endpoint request timestamps, for the budget. */
	private readonly requests = new Map<QuotaCapableAgent, number[]>();
	private readonly backoff = new Map<QuotaCapableAgent, number>();
	/** The last cadence the engine asked for, per agent. An on-demand read
	 * (the Usage page's Refresh) runs a batch with no schedule of its own and
	 * must not slow the active account down to the idle poll. */
	private readonly lastSchedules = new Map<AccountAgent, AgentPollSchedule>();
	/** KTD5: installed by the lock owner so its store is mirrored into
	 * quota.json for lock losers, and removed the moment it loses the lock. */
	private snapshotSink: ((snapshot: QuotaStoreSnapshot) => void) | null = null;
	/** KTD5: installed by a lock loser: the owner's mirror answers every read
	 * and no provider is called. Null with no engine, or while this process
	 * owns the lock. */
	private snapshotSource: (() => QuotaStoreSnapshot | null) | null = null;

	constructor(deps: QuotaStoreDeps = {}) {
		this.deps = deps;
		this.now = deps.now ?? Date.now;
	}

	/** KTD5: only the engine that owns the host-wide lock installs a sink. */
	setSnapshotSink(sink: ((snapshot: QuotaStoreSnapshot) => void) | null): void {
		this.snapshotSink = sink;
	}

	/**
	 * KTD5: only a lock loser installs a source. While one is set, `read`
	 * serves the owner's mirror and performs no fetch and no discovery — every
	 * host-service on this machine otherwise polls the same endpoints and
	 * defeats the host-wide request budget.
	 */
	setSnapshotSource(source: (() => QuotaStoreSnapshot | null) | null): void {
		this.snapshotSource = source;
	}

	entry(key: string): QuotaEntry | undefined {
		return this.entryMap.get(key);
	}

	/** Live entries, in discovery order. The engine reads them; nothing else
	 * may mutate them. */
	entries(agent?: QuotaCapableAgent): QuotaEntry[] {
		const all = [...this.entryMap.values()];
		return agent ? all.filter((entry) => entry.agent === agent) : all;
	}

	snapshot(): QuotaStoreSnapshot {
		return {
			entries: this.entries().map((entry) => ({
				key: entry.key,
				agent: entry.agent,
				selection: entry.selection,
				accounts: entry.accounts,
				fetchedAt: entry.fetchedAt,
				tokenState: entry.tokenState,
				lastError: entry.lastError,
			})),
		};
	}

	/**
	 * Serves the Usage page and the router's known-selection checks: cached
	 * entries are returned as they are, stale ones are fetched on demand.
	 */
	async read(
		options: { agents?: QuotaCapableAgent[]; forceRefresh?: boolean } = {},
	): Promise<UsageAccount[]> {
		const agents = options.agents ?? ALL_AGENTS;
		// KTD5: a lock loser answers from the owner's mirror, forced refresh
		// included — the owner is already polling on this machine's behalf.
		const mirrored = this.readMirror(agents);
		if (mirrored) return mirrored;
		const now = this.now();
		await Promise.all(
			agents.map((agent) =>
				this.ensureEntries(agent, now, options.forceRefresh ?? false),
			),
		);
		const stale = agents
			.flatMap((agent) => this.entries(agent))
			.filter(
				(entry) =>
					entry.fetchable &&
					(options.forceRefresh ||
						entry.fetchedAt === null ||
						now - entry.fetchedAt >= QUOTA_TTL_MS),
			);
		if (stale.length > 0) {
			await this.runBatch(stale, now);
			this.emitSnapshot();
		}
		return this.collect(agents);
	}

	/** The engine tick (KTD1): fetch what the schedule says is due. */
	async refreshDue(now: number, schedule: QuotaRefreshSchedule): Promise<void> {
		const agents = Object.keys(schedule) as AccountAgent[];
		await Promise.all(
			agents.map((agent) => this.ensureEntries(agent, now, false)),
		);

		const due: QuotaEntry[] = [];
		for (const agent of agents) {
			const agentSchedule = schedule[agent];
			if (!agentSchedule) continue;
			this.lastSchedules.set(agent, agentSchedule);
			const candidates = this.entries(agent)
				.filter((entry) => entry.fetchable && entry.nextPollAt <= now)
				// The active entry goes first, so the budget defers the others
				// before it ever holds back the account sessions run on.
				.sort((a, b) => {
					const rank =
						Number(b.key === agentSchedule.activeKey) -
						Number(a.key === agentSchedule.activeKey);
					return rank !== 0 ? rank : a.nextPollAt - b.nextPollAt;
				});
			const budget = budgetMaxRequests(agentSchedule.intervalMs);
			let used = this.requestsInWindow(agent, now);
			for (const entry of candidates) {
				if (used < budget) {
					used++;
					due.push(entry);
				} else {
					this.deferForBudget(entry, now);
				}
			}
		}

		if (due.length === 0) return;
		await this.runBatch(due, now, schedule);
		this.emitSnapshot();
	}

	/** Drops one entry (and re-arms discovery, so the next read rebuilds it). */
	invalidate(key: string): void {
		const entry = this.entryMap.get(key);
		if (!entry) return;
		this.entryMap.delete(key);
		if (entry.agent === "claude" || entry.agent === "codex") {
			this.discoveredAt.delete(entry.agent);
		}
	}

	private async ensureEntries(
		agent: QuotaCapableAgent,
		now: number,
		force: boolean,
	): Promise<void> {
		if (GROUP_AGENTS.includes(agent)) {
			const key = quotaEntryKey(agent, null);
			if (!this.entryMap.has(key)) {
				this.entryMap.set(key, newEntry(key, agent, null, true, now));
			}
			return;
		}
		const accountAgent = agent as AccountAgent;
		const discoveredAt = this.discoveredAt.get(accountAgent);
		const due =
			force ||
			discoveredAt === undefined ||
			now - discoveredAt >= DISCOVERY_INTERVAL_MS;
		if (!due) return;
		const existing = this.discoveryInflight.get(accountAgent);
		if (existing) return existing;
		const promise = this.discover(accountAgent, now).finally(() => {
			this.discoveryInflight.delete(accountAgent);
		});
		this.discoveryInflight.set(accountAgent, promise);
		return promise;
	}

	private async discover(agent: AccountAgent, now: number): Promise<void> {
		let targets: QuotaDiscovery;
		try {
			targets =
				agent === "claude"
					? await (this.deps.discoverClaude ?? discoverClaudeQuotaTargets)()
					: await (this.deps.discoverCodex ?? discoverCodexQuotaTargets)();
		} catch (error) {
			// Discovery is local I/O; a failure leaves the known entries alone
			// rather than emptying the Usage page.
			console.warn(`[quota-store] ${agent} discovery failed:`, error);
			return;
		}

		const keep = new Set<string>();
		for (const selection of targets.selections) {
			const key = quotaEntryKey(agent, selection);
			keep.add(key);
			if (!this.entryMap.has(key)) {
				this.entryMap.set(key, newEntry(key, agent, selection, true, now));
			}
		}
		for (const account of targets.staticAccounts) {
			const key = quotaEntryKey(agent, account.selection);
			keep.add(key);
			const entry =
				this.entryMap.get(key) ??
				newEntry(key, agent, account.selection, false, now);
			entry.fetchable = false;
			entry.accounts = [account];
			entry.fetchedAt = now;
			entry.tokenState = deriveTokenState([account]);
			entry.lastError = null;
			entry.nextPollAt = Number.POSITIVE_INFINITY;
			this.entryMap.set(key, entry);
		}
		// Only a pass that saw everything may reap: a scan that ran out of its
		// time budget half-way lists fewer profiles than exist, and deleting the
		// rest would drop live accounts off the Usage page and out of rotation.
		if (targets.complete !== false) {
			for (const [key, entry] of [...this.entryMap]) {
				if (entry.agent === agent && !keep.has(key)) this.entryMap.delete(key);
			}
		}
		this.discoveredAt.set(agent, now);
	}

	private async runBatch(
		entries: QuotaEntry[],
		now: number,
		schedule?: QuotaRefreshSchedule,
	): Promise<void> {
		const outcomes = await Promise.all(
			entries.map((entry) => this.fetchEntry(entry, now)),
		);
		// Decided from the whole batch, so the endpoint's back-off does not
		// depend on which fetch happened to settle last.
		for (const agent of new Set(entries.map((entry) => entry.agent))) {
			const forAgent = outcomes.filter((outcome) => outcome.agent === agent);
			if (forAgent.some((outcome) => outcome.rateLimited)) {
				this.applyBackoff(agent, now);
			} else if (forAgent.some((outcome) => outcome.ok)) {
				this.clearBackoff(agent);
			}
		}
		for (const entry of entries) this.scheduleNext(entry, now, schedule);
	}

	/** Concurrent callers share one in-flight fetch per entry. */
	private fetchEntry(
		entry: QuotaEntry,
		now: number,
	): Promise<QuotaFetchOutcome> {
		if (entry.inflight) return entry.inflight;
		const promise = this.runFetch(entry, now).finally(() => {
			entry.inflight = null;
		});
		entry.inflight = promise;
		return promise;
	}

	private async runFetch(
		entry: QuotaEntry,
		now: number,
	): Promise<QuotaFetchOutcome> {
		this.recordRequest(entry.agent, now);
		try {
			const { accounts, rateLimited } = await this.fetchAccounts(entry);
			entry.accounts = accounts.map((account) =>
				carryLastKnownWindows(entry.accounts, account),
			);
			entry.fetchedAt = now;
			entry.lastError = null;
			entry.tokenState = deriveTokenState(entry.accounts);
			return { agent: entry.agent, ok: true, rateLimited };
		} catch (error) {
			// AE10: the previous accounts stay; only `lastError` moves, and
			// `fetchedAt` does not, so the next read retries instead of
			// replaying the failure for the whole TTL.
			entry.lastError = error instanceof Error ? error.message : String(error);
			return { agent: entry.agent, ok: false, rateLimited: false };
		}
	}

	private async fetchAccounts(
		entry: QuotaEntry,
	): Promise<{ accounts: UsageAccount[]; rateLimited: boolean }> {
		switch (entry.agent) {
			case "claude": {
				const result = await (
					this.deps.fetchClaude ?? fetchClaudeAccountForSelection
				)(entry.selection);
				return {
					accounts: result.account ? [result.account] : [],
					rateLimited: result.rateLimited,
				};
			}
			case "codex": {
				const result = await (
					this.deps.fetchCodex ?? fetchCodexAccountForSelection
				)(entry.selection);
				return {
					accounts: result.account ? [result.account] : [],
					rateLimited: result.rateLimited,
				};
			}
			case "grok":
				return {
					accounts: await (this.deps.fetchGrok ?? fetchGrokAccounts)(),
					rateLimited: false,
				};
			case "agy":
				return {
					accounts: await (this.deps.fetchAgy ?? fetchAgyAccounts)(),
					rateLimited: false,
				};
		}
	}

	/**
	 * KTD5: the lock owner's `quota.json`, or — until it has published one —
	 * whatever this store already knows. Never a fetch: a loser that fell back
	 * to polling would multiply this machine's provider requests by the number
	 * of host-services running on it.
	 */
	private readMirror(agents: QuotaCapableAgent[]): UsageAccount[] | null {
		if (!this.snapshotSource) return null;
		const snapshot = this.snapshotSource();
		if (!snapshot) return this.collect(agents);
		return this.collect(
			agents,
			snapshot.entries.map((entry) => ({
				agent: entry.agent,
				accounts: entry.accounts.map(reviveAccountDates),
			})),
		);
	}

	private collect(
		agents: QuotaCapableAgent[],
		from: Array<{
			agent: QuotaCapableAgent;
			accounts: UsageAccount[];
		}> = this.entries(),
	): UsageAccount[] {
		const ordered = ALL_AGENTS.filter((agent) => agents.includes(agent));
		const accounts: UsageAccount[] = [];
		for (const agent of ordered) {
			const forAgent = from
				.filter((entry) => entry.agent === agent)
				.flatMap((entry) => entry.accounts);
			// One Codex login reachable from several homes is one account.
			accounts.push(
				...(agent === "codex" ? dedupeCodexAccounts(forAgent) : forAgent),
			);
		}
		return accounts;
	}

	private scheduleNext(
		entry: QuotaEntry,
		now: number,
		schedule?: QuotaRefreshSchedule,
	): void {
		const agentSchedule =
			entry.agent === "claude" || entry.agent === "codex"
				? (schedule?.[entry.agent] ?? this.lastSchedules.get(entry.agent))
				: undefined;
		const base = !agentSchedule
			? IDLE_POLL_MS
			: entry.key === agentSchedule.activeKey
				? agentSchedule.intervalMs
				: isExhausted(entry)
					? EXHAUSTED_POLL_MS
					: IDLE_POLL_MS;
		const next = now + Math.max(base, entry.backoffMs);
		const wakeAt = agentSchedule?.wakeAt;
		entry.nextPollAt =
			wakeAt !== undefined && entry.backoffMs === 0
				? Math.min(next, Math.max(wakeAt, now + 1))
				: next;
	}

	/** KTD10: a 429 targets the poller, so every entry on that endpoint waits. */
	private applyBackoff(agent: QuotaCapableAgent, now: number): void {
		const current = this.backoff.get(agent) ?? 0;
		const next = Math.min(
			current === 0 ? INITIAL_BACKOFF_MS : current * 2,
			MAX_BACKOFF_MS,
		);
		this.backoff.set(agent, next);
		for (const entry of this.entries(agent)) {
			if (!entry.fetchable) continue;
			entry.backoffMs = next;
			entry.nextPollAt = now + next;
		}
	}

	private clearBackoff(agent: QuotaCapableAgent): void {
		if ((this.backoff.get(agent) ?? 0) === 0) return;
		this.backoff.set(agent, 0);
		for (const entry of this.entries(agent)) entry.backoffMs = 0;
	}

	private recordRequest(agent: QuotaCapableAgent, now: number): void {
		const times = this.requests.get(agent) ?? [];
		times.push(now);
		this.requests.set(
			agent,
			times.filter((at) => at > now - BUDGET_WINDOW_MS),
		);
	}

	private requestsInWindow(agent: QuotaCapableAgent, now: number): number {
		const times = (this.requests.get(agent) ?? []).filter(
			(at) => at > now - BUDGET_WINDOW_MS,
		);
		this.requests.set(agent, times);
		return times.length;
	}

	/** Wait for the moment the oldest request leaves the budget window. */
	private deferForBudget(entry: QuotaEntry, now: number): void {
		const oldest = (this.requests.get(entry.agent) ?? [])[0] ?? now;
		entry.nextPollAt = Math.max(now + 1, oldest + BUDGET_WINDOW_MS);
	}

	private emitSnapshot(): void {
		if (!this.deps.onSnapshot && !this.snapshotSink) return;
		const snapshot = this.snapshot();
		this.deps.onSnapshot?.(snapshot);
		this.snapshotSink?.(snapshot);
	}
}

/** The mirror is JSON on disk, so its timestamps come back as strings. */
function reviveAccountDates(account: UsageAccount): UsageAccount {
	return {
		...account,
		fetchedAt: new Date(account.fetchedAt),
		windows: account.windows.map((window) => ({
			...window,
			resetsAt: window.resetsAt === null ? null : new Date(window.resetsAt),
		})),
	};
}

function newEntry(
	key: string,
	agent: QuotaCapableAgent,
	selection: string | null,
	fetchable: boolean,
	now: number,
): QuotaEntry {
	return {
		key,
		agent,
		selection,
		accounts: [],
		fetchedAt: null,
		nextPollAt: now,
		backoffMs: 0,
		lastError: null,
		tokenState: "unavailable",
		fetchable,
		inflight: null,
	};
}
