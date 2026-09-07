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
/**
 * KTD5: how old the lock owner's mirror may be and still answer for an agent.
 * A live owner republishes every time it polls, and its slowest cadence is
 * {@link EXHAUSTED_POLL_MS} (R22's all-exhausted latch), so a snapshot older
 * than that plus a tick's margin belongs to an owner that departed or stopped
 * publishing. Serving that one anyway would freeze this host's account list at
 * whatever it last said — accounts added since stay missing, removed ones stay
 * as ghosts — and would suppress local discovery for those agents for good.
 */
export const MIRROR_MAX_AGE_MS = EXHAUSTED_POLL_MS + 2 * 60_000;
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
	/**
	 * Other config dirs holding this login, dropped by the identity dedupe
	 * (KTD4). Kept on the entry because a fetch reads one selection at a time
	 * and never sees them: only the discovery pass does.
	 */
	duplicateSelections?: string[];
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
	 * Dirs the identity dedupe dropped, by entry key: two dirs holding one
	 * login collapse to one row, and the dropped dir is still on disk with a
	 * profile to remove. Absent from a producer whose logins never collapse.
	 */
	duplicateSelections?: Record<string, string[]>;
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
	duplicateSelections?: string[];
	accounts: UsageAccount[];
	fetchedAt: number | null;
	tokenState: QuotaTokenState;
	lastError: string | null;
}

export interface QuotaStoreSnapshot {
	entries: QuotaStoreSnapshotEntry[];
	/**
	 * When the publishing store built this snapshot, so a lock loser can bound
	 * the age of what it serves ({@link MIRROR_MAX_AGE_MS}). Absent from a
	 * mirror an older host-service wrote: an age nobody can tell is not one to
	 * trust, so such a mirror is read past.
	 */
	writtenAt?: number;
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
	/** The entry was under the endpoint's back-off when it was fetched. */
	backedOff: boolean;
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
 * A fetch rebuilds one selection at a time and knows nothing of the other dirs
 * holding the same login, so the entry's copy goes back onto the row — without
 * it the dropped dirs have no route to the Usage page and the profile they
 * name cannot be removed.
 */
function withDuplicateSelections(
	account: UsageAccount,
	duplicateSelections: string[] | undefined,
): UsageAccount {
	if (!duplicateSelections) return account;
	return { ...account, duplicateSelections };
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
	// The provider's own account id decides this, not the profile dir: a
	// re-login swaps the account behind an unchanged path, and matching on the
	// path would hand account B the windows, extra usage and credits account A
	// last read. The key/selection match is only for credentials that carry no
	// identity at all (API-key logins), where there is nothing better.
	const last = previous.find((candidate) =>
		account.accountId !== null || candidate.accountId !== null
			? candidate.accountId === account.accountId
			: candidate.accountKey === account.accountKey ||
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
	/** Said once: a mirror this host cannot read is re-read every few seconds. */
	private warnedMirrorShape = false;
	/** Said once, for the same reason: the mirror is rewritten every tick. */
	private warnedMirrorWrite = false;

	constructor(deps: QuotaStoreDeps = {}) {
		this.deps = deps;
		this.now = deps.now ?? Date.now;
	}

	/** KTD5: only the engine that owns the host-wide lock installs a sink. */
	setSnapshotSink(sink: ((snapshot: QuotaStoreSnapshot) => void) | null): void {
		this.snapshotSink = sink;
	}

	/**
	 * KTD5: only a lock loser installs a source. For every agent the owner has
	 * actually published, `read` serves that mirror and performs no fetch and
	 * no discovery — every host-service on this machine otherwise polls the
	 * same endpoints and defeats the host-wide request budget. An agent the
	 * mirror says nothing about is read locally, though (see
	 * {@link readMirror}).
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
			writtenAt: this.now(),
			entries: this.entries().map((entry) => ({
				key: entry.key,
				agent: entry.agent,
				selection: entry.selection,
				duplicateSelections: entry.duplicateSelections,
				// The mirror is the whole answer for a lock loser, so the dropped
				// dirs travel on the accounts it serves too.
				accounts: entry.accounts.map((account) =>
					withDuplicateSelections(account, entry.duplicateSelections),
				),
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
		// included — the owner is already polling on this machine's behalf. The
		// mirror covers one agent at a time, though (an owner polling Claude
		// with Codex disabled publishes Claude alone), so the agents it does not
		// cover are still discovered and fetched here.
		const mirrored = this.readMirror(agents);
		const uncovered = agents.filter(
			(agent) => !mirrored.covered.includes(agent),
		);
		if (uncovered.length === 0) return this.collect(agents, mirrored.entries);
		const now = this.now();
		await Promise.all(
			uncovered.map((agent) =>
				this.ensureEntries(agent, now, options.forceRefresh ?? false),
			),
		);
		const stale = uncovered.flatMap((agent) => {
			const ready = this.entries(agent).filter(
				(entry) =>
					entry.fetchable &&
					// The endpoint's back-off outranks both the TTL and the Usage
					// page's Refresh: the entry is still served below with its
					// last-known accounts, only the request is withheld.
					!this.heldByBackoff(entry, now) &&
					(options.forceRefresh ||
						entry.fetchedAt === null ||
						now - entry.fetchedAt >= QUOTA_TTL_MS),
			);
			// The same per-endpoint budget refreshDue obeys. Without it a
			// Refresh on a host with many profiles fired one request per stale
			// entry at once — the burst that earns the 429 — and the requests it
			// recorded then deferred the active account's own poll for the rest
			// of the window. The active entry goes first for the same reason it
			// does there, and a row that does not fit is served from its
			// last-known accounts, which is the contract the back-off already
			// uses — except for a row that has nothing to serve, which goes out
			// past the budget (below).
			// Only the switchable agents are ever scheduled, so the rest simply
			// have no recorded interval and fall to the default budget.
			const schedule =
				agent === "claude" || agent === "codex"
					? this.lastSchedules.get(agent)
					: undefined;
			const activeKey = schedule?.activeKey;
			const budget = budgetMaxRequests(schedule?.intervalMs);
			const room = budget - this.requestsInWindow(agent, now);
			// An entry with nothing to serve cannot be "served from its
			// last-known accounts": deferring it drops the profile off the
			// answer entirely, with no row and no error. Those go out past the
			// budget — one request per profile, once — while a row that already
			// failed carries a lastError and queues with the rest.
			const unserved = ready.filter(
				(entry) =>
					entry.fetchedAt === null &&
					entry.accounts.length === 0 &&
					entry.lastError === null,
			);
			const rest = ready.filter((entry) => !unserved.includes(entry));
			return [
				...unserved,
				...rest
					.sort(
						(a, b) =>
							Number(b.key === activeKey) - Number(a.key === activeKey) ||
							a.nextPollAt - b.nextPollAt ||
							(a.fetchedAt ?? 0) - (b.fetchedAt ?? 0),
					)
					.slice(0, Math.max(0, room - unserved.length)),
			];
		});
		if (stale.length > 0) {
			await this.runBatch(stale, now);
			this.emitSnapshot();
		}
		return this.collect(agents, [
			...mirrored.entries,
			...uncovered.flatMap((agent) => this.entries(agent)),
		]);
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
					// A never-fetched entry breaks the nextPollAt tie: with more
					// selections than the budget allows, deferForBudget lands the
					// deferred one on the same nextPollAt as the entries just
					// fetched, and a stable sort would then hand the slots to the
					// same winners every window — leaving the last profile with
					// fetchedAt null for good.
					return (
						rank ||
						a.nextPollAt - b.nextPollAt ||
						(a.fetchedAt ?? 0) - (b.fetchedAt ?? 0)
					);
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
				this.entryMap.set(
					key,
					newEntry(key, agent, null, true, now, this.backoff.get(agent) ?? 0),
				);
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
			const existing = this.entryMap.get(key);
			if (!existing) {
				const entry = newEntry(
					key,
					agent,
					selection,
					true,
					now,
					this.backoff.get(agent) ?? 0,
				);
				entry.duplicateSelections = targets.duplicateSelections?.[key];
				this.entryMap.set(key, entry);
				continue;
			}
			// Re-read every pass: a dir the user removed, or one that stopped
			// sharing this login, must not linger on the row.
			existing.duplicateSelections = targets.duplicateSelections?.[key];
			// A signed-out profile is carried as a static row with no fetch of
			// its own. Once the Switch sign-in flow restores its credential the
			// discovery pass lists it as a selection again, so the row goes back
			// to being fetchable and is read at once — otherwise it keeps its
			// signed-out numbers until the host-service restarts. Its accounts
			// are still the static ones, so it counts as never fetched.
			if (!existing.fetchable) {
				existing.fetchable = true;
				existing.fetchedAt = null;
				// Seeded from the endpoint back-off exactly as newEntry is: a row
				// re-armed mid-back-off would otherwise probe a rate-limited
				// endpoint immediately, earn a fresh 429, and push every other
				// account's recovery out by the full interval again.
				const backoff = this.backoff.get(agent) ?? 0;
				existing.backoffMs = backoff;
				existing.nextPollAt = now + backoff;
			}
		}
		for (const account of targets.staticAccounts) {
			const key = quotaEntryKey(agent, account.selection);
			keep.add(key);
			const entry =
				this.entryMap.get(key) ??
				// A static row has no fetch of its own, so no back-off to sit out.
				newEntry(key, agent, account.selection, false, now, 0);
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
		const settled = await Promise.all(
			entries.map((entry) => this.fetchEntry(entry, now)),
		);
		const outcomes = settled.filter(
			(outcome): outcome is QuotaFetchOutcome => outcome !== null,
		);
		// Decided from the whole batch, so the endpoint's back-off does not
		// depend on which fetch happened to settle last.
		for (const agent of new Set(entries.map((entry) => entry.agent))) {
			const forAgent = outcomes.filter((outcome) => outcome.agent === agent);
			if (forAgent.some((outcome) => outcome.rateLimited)) {
				this.applyBackoff(agent, now);
			} else if (forAgent.some((outcome) => outcome.ok && outcome.backedOff)) {
				this.clearBackoff(agent);
			}
		}
		for (const entry of entries) this.scheduleNext(entry, now, schedule);
	}

	/** Concurrent callers share one in-flight fetch per entry. */
	private fetchEntry(
		entry: QuotaEntry,
		now: number,
	): Promise<QuotaFetchOutcome | null> {
		// A caller that joined an in-flight fetch shares its result but not its
		// vote: two overlapping batches awaiting one 429 would otherwise each
		// advance the endpoint ladder, spending two rungs on one response.
		if (entry.inflight) return entry.inflight.then(() => null);
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
		// Whether the endpoint's back-off covered this entry, read before the
		// fetch that may clear it: an entry carrying no back-off of its own
		// never sat one out, so its success must not end the endpoint's.
		const backedOff = entry.backoffMs > 0;
		this.recordRequest(entry.agent, now);
		try {
			const { accounts, rateLimited } = await this.fetchAccounts(entry);
			// A discovery pass that ran while this fetch was in flight may have
			// carried the row whole (signed out, API-billed): that row is the newer
			// truth and this result is about a credential that is already gone.
			// Writing it back would empty the row — no signed-out card on the Usage
			// page, so no Switch sign-in and no Remove — until the next pass. The
			// endpoint's answer still votes on the back-off.
			if (!entry.fetchable) {
				return { agent: entry.agent, ok: true, rateLimited, backedOff };
			}
			// A per-selection row stands for one login the discovery pass found, so
			// zero accounts is never "correctly nothing" — it is a credential that
			// could not be read, and every such branch returns before any request.
			// Treat it as the catch path does: keep the last-known accounts, leave
			// `fetchedAt` where it is so the next read retries, and never vote a
			// request that never happened as the success that ends the endpoint's
			// back-off. Group agents are the exception: their one row holds every
			// account of that agent, so [] really is none.
			if (accounts.length === 0 && !GROUP_AGENTS.includes(entry.agent)) {
				entry.lastError = "the credential could not be read";
				return { agent: entry.agent, ok: false, rateLimited, backedOff };
			}
			entry.accounts = accounts.map((account) =>
				withDuplicateSelections(
					carryLastKnownWindows(entry.accounts, account),
					entry.duplicateSelections,
				),
			);
			entry.fetchedAt = now;
			entry.lastError = null;
			entry.tokenState = deriveTokenState(entry.accounts);
			return { agent: entry.agent, ok: true, rateLimited, backedOff };
		} catch (error) {
			// AE10: the previous accounts stay; only `lastError` moves, and
			// `fetchedAt` does not, so the next read retries instead of
			// replaying the failure for the whole TTL.
			// Same as above: a row a discovery pass carried whole while this fetch
			// was in flight must not be pinned with an error about a credential
			// that is already gone.
			if (entry.fetchable) {
				entry.lastError =
					error instanceof Error ? error.message : String(error);
			}
			return { agent: entry.agent, ok: false, rateLimited: false, backedOff };
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
	 * KTD5: the lock owner's `quota.json`. Serving it is what keeps a loser
	 * from multiplying this machine's provider requests by the number of
	 * host-services running on it.
	 *
	 * Coverage is per requested agent, not all-or-nothing: an agent the owner
	 * published nothing for is one this host reads for itself. That is the
	 * ordinary state of an owner whose auto-switch is off for one agent — it
	 * polls only the other — so treating its silence as the answer would leave
	 * the uncovered agent missing from every other host's Usage page for good.
	 *
	 * Coverage is also bounded in time: a snapshot older than
	 * {@link MIRROR_MAX_AGE_MS} covers nothing, so every agent falls through to
	 * the local read exactly as an uncovered one does. `quota.json` outlives
	 * the owner that wrote it, and an owner that departed — or one that never
	 * republishes because auto-switch is off — would otherwise keep answering
	 * for this host forever with the accounts it happened to see.
	 *
	 * The mirror is JSON another process wrote, so one malformed entry is
	 * dropped rather than allowed to throw out of every read on this host.
	 */
	private readMirror(agents: QuotaCapableAgent[]): {
		entries: Array<{ agent: QuotaCapableAgent; accounts: UsageAccount[] }>;
		covered: QuotaCapableAgent[];
	} {
		const empty = { entries: [], covered: [] };
		if (!this.snapshotSource) return empty;
		const snapshot = this.snapshotSource();
		const writtenAt = snapshot?.writtenAt;
		const now = this.now();
		if (typeof writtenAt !== "number" || now - writtenAt > MIRROR_MAX_AGE_MS) {
			return empty;
		}
		const mirrored: Array<{
			agent: QuotaCapableAgent;
			accounts: UsageAccount[];
		}> = [];
		const covered = new Set<QuotaCapableAgent>();
		/** Agents with at least one stale row; see the return below. */
		const staleAgents = new Set<QuotaCapableAgent>();
		let dropped = 0;
		for (const entry of snapshot?.entries ?? []) {
			try {
				if (!agents.includes(entry.agent)) continue;
				// Per entry, not just per snapshot: `writtenAt` is refreshed by every
				// emitSnapshot, including ones a different agent's poll triggered, so a
				// row the owner never polls (grok/agy are not AccountAgents, so
				// `refreshDue` cannot reach them) would ride a fresh snapshot forever
				// with its original numbers, and no forced refresh could break out.
				if (
					entry.fetchedAt === null ||
					now - entry.fetchedAt > MIRROR_MAX_AGE_MS
				) {
					staleAgents.add(entry.agent);
					continue;
				}
				mirrored.push({
					agent: entry.agent,
					accounts: entry.accounts.map(reviveAccountDates),
				});
				covered.add(entry.agent);
			} catch {
				dropped++;
			}
		}
		if (dropped > 0 && !this.warnedMirrorShape) {
			this.warnedMirrorShape = true;
			console.warn(
				`[quota-store] the owner's quota mirror holds ${dropped} malformed entr${
					dropped === 1 ? "y" : "ies"
				}; ignoring them`,
			);
		}
		// Coverage is per agent, so one stale row uncovers the whole agent: the
		// accounts behind that row are not in the mirror's answer, and marking
		// the agent answered anyway would drop them from this host with no local
		// read to bring them back. Its mirrored rows go too, or the local read
		// that now runs would duplicate them.
		const fresh = [...covered].filter((agent) => !staleAgents.has(agent));
		return {
			entries: mirrored.filter((entry) => fresh.includes(entry.agent)),
			covered: fresh,
		};
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
		// A static row polls never, and its `Infinity` must survive a fetch that
		// was in flight when the discovery pass carried the row whole — as
		// {@link applyBackoff} already leaves such a row alone.
		if (!entry.fetchable) return;
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
		// Only a wake still ahead of us shortens the cadence. `nearestReset` takes
		// the soonest `resetsAt` in the pool without filtering out the past ones,
		// and the pool keeps last-known windows through a failed or stale fetch —
		// so a latched agent can emit the same elapsed `wakeAt` on every tick, and
		// clamping to `now + 1` polled an already-exhausted endpoint every tick.
		entry.nextPollAt =
			wakeAt !== undefined && wakeAt > now && entry.backoffMs === 0
				? Math.min(next, wakeAt)
				: next;
	}

	/**
	 * KTD10: an entry the endpoint's back-off still covers. `refreshDue`
	 * honours it through `nextPollAt`, which {@link applyBackoff} pushes past
	 * the back-off for every entry on the endpoint; `read` has to ask for it,
	 * because neither its TTL nor a forced refresh looks at `nextPollAt` — and
	 * a back-off only the engine's tick respects holds nothing back.
	 */
	private heldByBackoff(entry: QuotaEntry, now: number): boolean {
		return (this.backoff.get(entry.agent) ?? 0) > 0 && entry.nextPollAt > now;
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
			// A floor, like scheduleNext and deferForBudget use: a 429 on one
			// selection must never pull another entry's poll earlier, or the
			// endpoint that just rate-limited gets a burst instead of a pause.
			entry.nextPollAt = Math.max(entry.nextPollAt, now + next);
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
		try {
			this.deps.onSnapshot?.(snapshot);
			this.snapshotSink?.(snapshot);
		} catch (error) {
			// The sink writes quota.json, so a full or read-only disk throws here.
			// The mirror is an optimisation for the other host-services on this
			// machine: a host that cannot publish it still serves its own accounts
			// rather than failing the fetch that already succeeded — and a frozen
			// mirror uncovers its agent by age, so the losers read locally.
			if (!this.warnedMirrorWrite) {
				this.warnedMirrorWrite = true;
				console.warn(
					"[quota-store] could not publish the quota mirror:",
					error,
				);
			}
		}
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
	/**
	 * KTD10: the endpoint's back-off when the entry appeared. A profile
	 * discovered mid-back-off starts inside it like every other entry on that
	 * endpoint; seeded at zero it would be due at once and probe the endpoint
	 * a 429 just told the store to leave alone.
	 */
	backoffMs: number,
): QuotaEntry {
	return {
		key,
		agent,
		selection,
		accounts: [],
		fetchedAt: null,
		nextPollAt: now + backoffMs,
		backoffMs,
		lastError: null,
		tokenState: "unavailable",
		fetchable,
		inflight: null,
	};
}
