/**
 * The account engine: one tick, one decision, one switch (KTD1).
 *
 * It is a runtime manager in the shape of `PageWatchManager` — a fixed
 * interval, per-entry due times, and every reach into the rest of the service
 * through a closure `app.ts` injects. It never imports a router, so it runs on
 * a headless host and in a unit test with the same code.
 *
 * What a tick does, in order:
 *
 *  1. claim or heartbeat the one-engine-per-Superset-home lock (KTD5). A
 *     loser polls nothing, decides nothing and swaps nothing; it only watches
 *     the shared `runtime.json` for an active account it did not choose and
 *     moves its own terminals when it changes. Two org host-services share a
 *     Superset home but no event bus, so that file is the only channel
 *     between them.
 *  2. refresh whatever the quota store says is due (KTD10).
 *  3. re-assert the Claude active dir's identity block, which a running
 *     Claude Code rewrites from memory (KTD3, KTD4).
 *  4. per enabled agent, ask `decision.ts` whether to move, and move.
 *
 * Two invariants worth stating because everything else depends on them:
 * a failed swap changes nothing at all — not the pointer, not the runtime
 * state, not the history (R24) — and no text sourced from a hook payload or a
 * terminal screen ever reaches an event, a log line or a state file (KTD6,
 * KTD7).
 */

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { HostDb } from "../db/index.ts";
import type {
	AccountEngineStatePayload,
	AccountSwitchedPayload,
	AccountSwitchFailureCode,
	AccountSwitchReasonKind,
} from "../events/types.ts";
import {
	activeClaudeConfigDir,
	ensureActiveClaudeDir,
} from "../trpc/router/usage/account-provisioning.ts";
import { updateClaudeStateFile } from "../trpc/router/usage/claude-state-file.ts";
import {
	type DefaultAccountSelections,
	getDefaultAccountSelections,
	setDefaultAccountSelection,
	setIdentityBindingRecorder,
} from "../trpc/router/usage/default-account.ts";
import {
	claudeStatePath,
	readClaudeLogin,
} from "../trpc/router/usage/profiles.ts";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../trpc/router/usage/types.ts";
import {
	type ClaudeLoginStoreRef,
	seedActiveClaudeLogin,
	swapClaudeLogin,
} from "./claude-login-swap.ts";
import {
	type DecisionAccount,
	isEligible,
	isNearLimit,
	pickBest,
	scoreAccount,
	shouldSwitch,
	worstWindow,
} from "./decision.ts";
import { DEFAULT_LOCK_STALE_MS, type EngineState } from "./engine-state.ts";
import type { AccountEngineHostDeps } from "./host-deps.ts";
import { fallbackAllowed } from "./limit-stop.ts";
import {
	EXHAUSTED_POLL_MS,
	eligibleForSwitch,
	type QuotaEntry,
	type QuotaRefreshSchedule,
	type QuotaStoreSnapshot,
	quotaEntryKey,
} from "./quota-store.ts";
import type {
	MovableSession,
	MoveResult,
	NeedsAttentionEvent,
} from "./session-mover.ts";
import type {
	AccountAgent,
	AutoSwitchSettings,
	EngineSettings,
	HistoryEntry,
	RotationState,
	RuntimeState,
} from "./types.ts";

/**
 * The base tick. Deliberately half the fastest configured poll interval
 * (R14's 30 seconds), so a 30-second interval is honoured rather than
 * silently rounded up to a minute; every other cadence lives in the quota
 * store's per-entry due times (KTD1, KTD10).
 */
export const BASE_TICK_MS = 30_000;

const AGENTS: readonly AccountAgent[] = ["claude", "codex"];
const HOUR_MS = 3_600_000;
const CLAUDE_RATE_LIMIT_HINT = "rate_limit";
const POLL_INTERVALS = new Set([30, 60, 120, 300]);

/** How long `stop()` waits for the work already in flight before it releases
 * the host lock anyway. Long enough for a provider call and a session move,
 * short enough that a wedged one cannot hold a shutdown open. */
const STOP_DRAIN_MS = 10_000;

/**
 * KTD7 gate 2 asks the mover two questions at once — did this terminal's own
 * screen show the limit, and is the account really spent — and only the first
 * costs nothing. A Claude hint's permission to read a screen is the hook
 * event, not the quota, so it is asked with a stand-in window that leaves the
 * screen as the only variable; the quota half is then evaluated against
 * numbers refreshed *after* the screen corroborated it, because a limit
 * reached between two polls is still a real limit.
 */
const SNAPSHOT_ONLY_WINDOWS: readonly UsageQuotaWindow[] = [
	{
		id: "limit-hint",
		label: "limit hint",
		usedPercent: 100,
		resetsAt: null,
	},
];

/** KTD13: the engine is refused on Windows rather than half-supported. */
export const WINDOWS_UNSUPPORTED_REASON =
	"Automatic account switching is not supported on Windows: the launch wrapper that re-resolves the account pointer is POSIX shell.";

/** What the active Claude dir holds right now (KTD3, KTD4). */
export interface ActiveDirIdentity {
	accountUuid: string | null;
	/** Digest of the credential, so an identity-only rewrite by a running
	 * Claude Code is told apart from someone logging in behind us. Compared
	 * in memory and never persisted. */
	credentialHash: string | null;
}

/** The slice of `QuotaStore` the engine uses, so tests can hand it a fake. */
export interface EngineQuotaStore {
	entries(agent?: AccountAgent): QuotaEntry[];
	entry(key: string): QuotaEntry | undefined;
	/** The on-demand read the Usage page uses: it discovers an agent's logins
	 * even on a host where nothing has polled yet (R3). */
	read(options?: {
		agents?: AccountAgent[];
		forceRefresh?: boolean;
	}): Promise<unknown>;
	refreshDue(now: number, schedule: QuotaRefreshSchedule): Promise<void>;
	setSnapshotSink(sink: ((snapshot: QuotaStoreSnapshot) => void) | null): void;
	setSnapshotSource(source: (() => QuotaStoreSnapshot | null) | null): void;
	snapshot(): QuotaStoreSnapshot;
}

/** The slice of `SessionMover` the engine uses (KTD8). */
export interface EngineSessionMover {
	moveAtIdle(agent: AccountAgent, rows?: MovableSession[]): Promise<MoveResult>;
	fallbackRestart(row: MovableSession): Promise<boolean>;
	corroborateLimitStop(
		row: MovableSession,
		windows: readonly UsageQuotaWindow[],
	): Promise<boolean>;
	onExternalSwitch(agent: AccountAgent): Promise<MoveResult>;
}

export interface AccountEngineBroadcast {
	switched(payload: AccountSwitchedPayload): void;
	engineState(payload: AccountEngineStatePayload): void;
}

export interface AccountEngineDeps {
	engineState: EngineState;
	quotaStore: EngineQuotaStore;
	mover: EngineSessionMover;
	hostDeps: AccountEngineHostDeps;
	db: HostDb;
	broadcast: AccountEngineBroadcast;
	now?: () => number;
	setIntervalFn?: typeof setInterval;
	clearIntervalFn?: typeof clearInterval;
	tickIntervalMs?: number;
	lockStaleMs?: number;
	platform?: NodeJS.Platform;
	swap?: typeof swapClaudeLogin;
	seed?: typeof seedActiveClaudeLogin;
	ensureActiveDir?: typeof ensureActiveClaudeDir;
	setPointer?: typeof setDefaultAccountSelection;
	/** The host pointer the agent wrappers resolve on every launch. It seeds
	 * the active account on a first run (KTD4). */
	readPointerSelections?: typeof getDefaultAccountSelections;
	updateClaudeStateFile?: typeof updateClaudeStateFile;
	/** KTD5: how the engine silences the discovery pass's unlocked write to
	 * runtime.json while this instance is a lock loser. */
	setBindingRecorder?: typeof setIdentityBindingRecorder;
	/** The active Claude dir's path, without provisioning it. */
	resolveActiveDir?: () => string;
	readActiveIdentity?: (activeDir: string) => Promise<ActiveDirIdentity>;
	/** The terminal-agent store's `change` signal: a limit-stop hint arrives
	 * as a store write, not as a tick (KTD7). */
	subscribeToSessions?: (onChange: () => void) => () => void;
}

export type SwitchOutcome =
	| { ok: true }
	| { ok: false; code: AccountSwitchFailureCode; reason: string };

/** A user's own switch can also be refused for holding no lock (KTD5), which
 * is not a swap failure and never reaches the `account:switched` bus. */
export type ManualSwitchOutcome =
	| SwitchOutcome
	| { ok: false; code: "lock-loser"; reason: string };

const LOCK_LOSER_REASON =
	"Another Superset instance on this machine owns account switching.";

/** KTD5: what every path that noticed the lock is gone returns. */
const LOCK_LOSER: ManualSwitchOutcome = {
	ok: false,
	code: "lock-loser",
	reason: LOCK_LOSER_REASON,
};

export type SettingsOutcome =
	| { ok: true; settings: EngineSettings }
	| {
			ok: false;
			code: "unsupported-platform" | "invalid" | "lock-loser";
			reason: string;
	  };

/** R16, and KTD5: the rotation flags live in the same host-wide state dir as
 * everything else, so a lock loser may not write them either. */
export type RotationOutcome =
	| { ok: true; rotation: RotationState }
	| { ok: false; code: "lock-loser"; reason: string };

export interface AgentEngineStatus {
	enabled: boolean;
	activeAccountId: string | null;
	activeSelection: string | null;
	cooldownUntil: number | null;
	exhausted: boolean;
	lockOwner: boolean;
	platformSupported: boolean;
}

/** One candidate with the quota entry it came from, so eligibility can use
 * the entry's freshness and the decision can stay pure. */
interface EngineAccount {
	entry: QuotaEntry;
	account: UsageAccount;
	row: DecisionAccount;
}

interface PerformSwitchInput {
	agent: AccountAgent;
	settings: AutoSwitchSettings;
	runtime: RuntimeState;
	from: DecisionAccount | null;
	target: DecisionAccount;
	reasonKind: AccountSwitchReasonKind;
	windowId: string | null;
	usedPercent: number | null;
	now: number;
	/**
	 * R8: the limit-stopped session's restart, run here rather than by the
	 * caller so the history row and the `account:switched` event can carry
	 * what actually happened instead of what was intended.
	 */
	fallbackRestart?: () => Promise<boolean>;
	/**
	 * KTD8: the terminal a limit hint named. The planned move leaves it alone
	 * so `fallbackRestart` is the one that restarts it — a bare restart here
	 * would consume its resume candidate and the continue nudge would never
	 * be typed.
	 */
	excludeTerminalId?: string;
}

/** A history row of a completed switch, with every field the
 * `account:switched` event needs settled rather than optional. */
type SwitchRecord = HistoryEntry & {
	reasonKind: AccountSwitchReasonKind;
	windowId: string | null;
	usedPercent: number | null;
	fallbackRestart: boolean;
};

/** The tick's already-loaded state, handed to the limit-hint pass so it does
 * not re-read the state dir and re-claim the lock straight after the tick. */
interface LimitHintPass {
	settings: EngineSettings;
	agents: readonly AccountAgent[];
	runtime: RuntimeState;
	rotation: RotationState;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function labelOf(account: UsageAccount): string | null {
	return account.email ?? account.sourceLabel ?? null;
}

/** The default identity read: the state file names the account, the
 * credential store gives the digest that tells our own write apart from
 * someone else's (KTD3). */
async function readActiveClaudeIdentity(
	activeDir: string,
): Promise<ActiveDirIdentity> {
	let accountUuid: string | null = null;
	try {
		const parsed = JSON.parse(
			await readFile(claudeStatePath(activeDir), "utf-8"),
		) as { oauthAccount?: { accountUuid?: string } };
		accountUuid = parsed.oauthAccount?.accountUuid ?? null;
	} catch {
		// Never written, or rewritten under us — either way there is no
		// identity to compare and the tick moves on.
	}
	const read = await readClaudeLogin(activeDir);
	const oauth = read.login?.claudeAiOauth;
	return {
		accountUuid,
		credentialHash: oauth
			? createHash("sha256").update(JSON.stringify(oauth)).digest("hex")
			: null,
	};
}

function validateSettings(settings: AutoSwitchSettings): string | null {
	if (
		!Number.isInteger(settings.thresholdPercent) ||
		settings.thresholdPercent < 1 ||
		settings.thresholdPercent > 100
	) {
		return "The threshold is a whole percentage between 1 and 100.";
	}
	if (!POLL_INTERVALS.has(settings.pollIntervalSeconds)) {
		return "The poll interval is 30, 60, 120 or 300 seconds.";
	}
	if (
		!Number.isInteger(settings.cooldownSeconds) ||
		settings.cooldownSeconds < 0
	) {
		return "The cooldown is a whole number of seconds, and never negative.";
	}
	if (settings.strategy !== "best" && settings.strategy !== "consume-first") {
		return "The strategy is either `best` or `consume-first`.";
	}
	if (settings.modelWindows.some((model) => typeof model !== "string")) {
		return "Model windows are provider model names.";
	}
	return null;
}

export class AccountEngine {
	private readonly deps: AccountEngineDeps;
	private readonly state: EngineState;
	private readonly quotaStore: EngineQuotaStore;
	private readonly mover: EngineSessionMover;
	private readonly hostDeps: AccountEngineHostDeps;
	private readonly db: HostDb;
	private readonly broadcast: AccountEngineBroadcast;
	private readonly now: () => number;
	private readonly setIntervalFn: typeof setInterval;
	private readonly clearIntervalFn: typeof clearInterval;
	private readonly tickIntervalMs: number;
	private readonly lockStaleMs: number;
	private readonly platform: NodeJS.Platform;
	private readonly swap: typeof swapClaudeLogin;
	private readonly seed: typeof seedActiveClaudeLogin;
	private readonly ensureActiveDir: typeof ensureActiveClaudeDir;
	private readonly setPointer: typeof setDefaultAccountSelection;
	private readonly readPointerSelections: typeof getDefaultAccountSelections;
	private readonly writeClaudeState: typeof updateClaudeStateFile;
	private readonly resolveActiveDir: () => string;
	private readonly readActiveIdentity: (
		activeDir: string,
	) => Promise<ActiveDirIdentity>;
	private readonly setBindingRecorder: typeof setIdentityBindingRecorder;

	/** This process's claim on the host-wide lock (KTD5). */
	private readonly nonce = randomUUID();
	private owner = false;
	/** The ownership the wiring below (quota mirror, binding recorder) was
	 * last set up for. Null until the first claim, so a loser that never owned
	 * the lock still gets a loser's wiring. */
	private ownershipApplied: boolean | null = null;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private ticking = false;
	private tickRequested = false;
	private handlingHints = false;
	/** Set by `stop()`, and checked at every awaited boundary: an engine that
	 * has handed the host lock back writes nothing more. */
	private stopped = false;
	/**
	 * One in-process mutation at a time. The tick, a manual switch and a
	 * limit-hint pass all read `runtime.json`, await I/O and write it back;
	 * without this they interleave and the last writer persists a snapshot
	 * taken before the other one's switch. The file lock (KTD5) serialises
	 * across processes; this chain serialises within one.
	 */
	private mutation: Promise<unknown> = Promise.resolve();
	private unsubscribeSessions: (() => void) | null = null;
	/** What this process last wrote into the active Claude dir (KTD3). */
	private lastWritten:
		| (ActiveDirIdentity & {
				keys: Record<string, unknown>;
		  })
		| null = null;
	/** Last engine-state broadcast per agent, so steady state is not resent. */
	private readonly lastState = new Map<AccountAgent, string>();
	/** A lock loser's view of the owner's active account and selection, for
	 * KTD5's runtime.json watch. Both halves: two Codex homes can share a null
	 * provider identity, and only the selection tells them apart. `undefined`
	 * means "not observed yet". */
	private readonly followedActive = new Map<AccountAgent, string>();
	/** Claude hints already acted on, keyed by the event that raised them. */
	private readonly handledHints = new Set<string>();

	constructor(deps: AccountEngineDeps) {
		this.deps = deps;
		this.state = deps.engineState;
		this.quotaStore = deps.quotaStore;
		this.mover = deps.mover;
		this.hostDeps = deps.hostDeps;
		this.db = deps.db;
		this.broadcast = deps.broadcast;
		this.now = deps.now ?? Date.now;
		this.setIntervalFn = deps.setIntervalFn ?? setInterval;
		this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
		this.tickIntervalMs = deps.tickIntervalMs ?? BASE_TICK_MS;
		this.lockStaleMs = deps.lockStaleMs ?? DEFAULT_LOCK_STALE_MS;
		this.platform = deps.platform ?? process.platform;
		this.swap = deps.swap ?? swapClaudeLogin;
		this.seed = deps.seed ?? seedActiveClaudeLogin;
		this.ensureActiveDir = deps.ensureActiveDir ?? ensureActiveClaudeDir;
		this.setPointer = deps.setPointer ?? setDefaultAccountSelection;
		this.readPointerSelections =
			deps.readPointerSelections ?? getDefaultAccountSelections;
		this.writeClaudeState = deps.updateClaudeStateFile ?? updateClaudeStateFile;
		this.resolveActiveDir = deps.resolveActiveDir ?? activeClaudeConfigDir;
		this.readActiveIdentity =
			deps.readActiveIdentity ?? readActiveClaudeIdentity;
		this.setBindingRecorder =
			deps.setBindingRecorder ?? setIdentityBindingRecorder;
	}

	// ── Lifecycle ──────────────────────────────────────────────────────

	start(): void {
		if (this.ticker) return;
		this.stopped = false;
		// Claimed at boot rather than a tick later: until this host owns the
		// lock every account mutation the Usage page sends is refused, and the
		// first tick is a whole interval away (KTD5).
		if (this.platformSupported()) this.ensureOwnership(this.now());
		this.ticker = this.setIntervalFn(() => {
			void this.tick();
		}, this.tickIntervalMs);
		this.ticker.unref?.();
		this.unsubscribeSessions =
			this.deps.subscribeToSessions?.(() => {
				void this.handleLimitHints();
			}) ?? null;
	}

	/**
	 * Ownership is handed back last. A tick already in flight still holds the
	 * credentials — it may be mid-swap — so releasing the lock before it ends
	 * would let another host on this machine claim it and swap at the same
	 * time. The flag stops that tick at its next awaited boundary; the wait is
	 * bounded so a wedged provider call cannot hold a shutdown open.
	 */
	async stop(): Promise<void> {
		this.stopped = true;
		if (this.ticker) {
			this.clearIntervalFn(this.ticker);
			this.ticker = null;
		}
		this.unsubscribeSessions?.();
		this.unsubscribeSessions = null;
		await this.settle(STOP_DRAIN_MS);
		this.releaseOwnership();
	}

	/** Waits for the mutation chain to drain, or for `timeoutMs`. */
	private async settle(timeoutMs: number): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<void>((done) => {
			timer = setTimeout(done, timeoutMs);
			timer.unref?.();
		});
		try {
			await Promise.race([this.mutation.catch(() => {}), deadline]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	/**
	 * Queues `run` behind whatever mutation is already in flight. Never call
	 * it from inside one: the inner call would wait for the outer to finish.
	 */
	private serialize<T>(run: () => Promise<T>): Promise<T> {
		const next = this.mutation.then(run, run);
		this.mutation = next.then(
			() => {},
			() => {},
		);
		return next;
	}

	// ── Public surface (U7) ────────────────────────────────────────────

	/**
	 * Runs `fn` on the same mutation lane as ticks and manual switches, for a
	 * caller whose work must not interleave with a switch — deleting a profile
	 * dir, say, which is not recoverable if a switch lands onto it first.
	 *
	 * In-process only: it serialises this host-service's own mutations. Across
	 * processes the host-wide lock still decides, and it is the switch side's
	 * `ensureOwnership` that a lock loser is stopped by.
	 */
	runExclusive<T>(fn: () => Promise<T>): Promise<T> {
		return this.serialize(fn);
	}

	getSettings(): EngineSettings {
		return this.state.readSettings();
	}

	setSettings(
		agent: AccountAgent,
		patch: Partial<AutoSwitchSettings>,
	): SettingsOutcome {
		if (patch.enabled === true && !this.platformSupported()) {
			return {
				ok: false,
				code: "unsupported-platform",
				reason: WINDOWS_UNSUPPORTED_REASON,
			};
		}
		if (!this.ownsMutations()) {
			return { ok: false, code: "lock-loser", reason: LOCK_LOSER_REASON };
		}
		const current = this.state.readSettings();
		const next: AutoSwitchSettings = { ...current[agent], ...patch };
		const invalid = validateSettings(next);
		if (invalid) return { ok: false, code: "invalid", reason: invalid };
		const settings: EngineSettings = { ...current, [agent]: next };
		this.state.writeSettings(settings);
		return { ok: true, settings };
	}

	setRotation(accountKey: string, inRotation: boolean): RotationOutcome {
		if (!this.ownsMutations()) {
			return { ok: false, code: "lock-loser", reason: LOCK_LOSER_REASON };
		}
		const rotation = { ...this.state.readRotation(), [accountKey]: inRotation };
		this.state.writeRotation(rotation);
		return { ok: true, rotation };
	}

	/**
	 * KTD5, re-read from disk rather than from the cached flag: the lock can
	 * have gone to another instance since the last tick, and the state dir it
	 * owns is where these writes land. On Windows the engine never claims the
	 * lock at all (KTD13), so there is nothing to revalidate.
	 */
	private ownsMutations(): boolean {
		if (!this.platformSupported()) return true;
		return this.ensureOwnership(this.now());
	}

	history(limit = 50): HistoryEntry[] {
		return this.state.readHistory(limit);
	}

	status(): Record<AccountAgent, AgentEngineStatus> {
		const settings = this.state.readSettings();
		const runtime = this.state.readRuntime();
		const supported = this.platformSupported();
		const of = (agent: AccountAgent): AgentEngineStatus => {
			const state = runtime.perAgent[agent];
			return {
				enabled: settings[agent].enabled,
				activeAccountId: state.activeAccountId,
				activeSelection: state.activeSelection,
				cooldownUntil: state.cooldownUntil,
				exhausted: state.exhaustedNotifiedAt !== null,
				lockOwner: this.owner,
				platformSupported: supported,
			};
		};
		return { claude: of("claude"), codex: of("codex") };
	}

	/**
	 * R2/R4: the user's own switch. Same path as an automatic one, so it
	 * reaches running sessions the same way; it restarts the cooldown and
	 * clears the exhaustion latch, and auto-switch stays on.
	 */
	async switchManually(
		agent: AccountAgent,
		selection: string | null,
	): Promise<ManualSwitchOutcome> {
		if (!this.platformSupported()) {
			return {
				ok: false,
				code: "unsupported-platform",
				reason: WINDOWS_UNSUPPORTED_REASON,
			};
		}
		// A tick may be mid-switch on a runtime snapshot of its own; this waits
		// for it rather than deciding against state that is about to change.
		return this.serialize(() => this.runManualSwitch(agent, selection));
	}

	private async runManualSwitch(
		agent: AccountAgent,
		selection: string | null,
	): Promise<ManualSwitchOutcome> {
		const now = this.now();
		// KTD5: another instance holding the lock owns the credentials, so a
		// swap here would sign its sessions out from under it.
		if (!this.ensureOwnership(now)) return LOCK_LOSER;
		const settings = this.state.readSettings();
		const runtime = this.state.readRuntime();
		let pool = this.pool(agent);
		if (!pool.some((item) => item.row.selection === selection)) {
			// R3: with auto-switch off nothing has ever polled this agent, so
			// the pool is empty on a host where the account plainly exists. One
			// on-demand read through the store — which owns the poll floor and
			// the back-off — before a valid selection is refused as unknown.
			await this.quotaStore.read({ agents: [agent] });
			if (!this.ensureOwnership(this.now())) return LOCK_LOSER;
			pool = this.pool(agent);
		}
		await this.resolveActive(agent, runtime);
		const state = runtime.perAgent[agent];
		const from = this.activeRow(pool, state)?.row ?? null;
		const target = pool.find((item) => item.row.selection === selection);
		if (!target) {
			return {
				ok: false,
				code: "unknown-account",
				reason: "That account is not one this host can see.",
			};
		}
		// R3: a manual switch may target any signed-in account — only an
		// expired refresh token or a sign-out is refused.
		if (
			target.entry.tokenState === "token_expired" ||
			target.entry.tokenState === "signed_out"
		) {
			return {
				ok: false,
				code: "no-target-login",
				reason: "That account is signed out; sign in again before switching.",
			};
		}
		// The dir is the user's, not Superset's: switching onto it would make
		// it the owner of the next save-back and write a credential there.
		if (!target.row.managed) {
			return {
				ok: false,
				code: "invalid-target",
				reason:
					"Superset does not manage this login; it can be used but not switched onto.",
			};
		}
		if (from && from.accountKey === target.row.accountKey) {
			state.cooldownUntil = now + settings[agent].cooldownSeconds * 1000;
			state.exhaustedNotifiedAt = null;
			this.state.writeRuntime(runtime);
			this.broadcastState(agent, settings[agent], runtime, now);
			return { ok: true };
		}

		const outcome = await this.performSwitch({
			agent,
			settings: settings[agent],
			runtime,
			from,
			target: target.row,
			reasonKind: "manual",
			windowId: null,
			usedPercent: null,
			now,
		});
		if (outcome.ok) this.broadcastState(agent, settings[agent], runtime, now);
		return outcome;
	}

	/** KTD8: a session the mover gave up on needs a human, not a retry. */
	reportNeedsAttention(event: NeedsAttentionEvent): void {
		const settings = this.state.readSettings();
		const runtime = this.state.readRuntime();
		this.broadcastState(
			event.agent,
			settings[event.agent],
			runtime,
			this.now(),
			{
				needsAttention: {
					workspaceId: event.workspaceId,
					terminalId: event.terminalId,
					reason: event.reason,
				},
			},
		);
	}

	// ── The tick ───────────────────────────────────────────────────────

	async tick(now: number = this.now()): Promise<void> {
		if (this.ticking) {
			this.tickRequested = true;
			return;
		}
		this.ticking = true;
		try {
			await this.serialize(() => this.runTick(now));
		} catch (error) {
			console.warn("[account-engine] tick failed:", error);
		} finally {
			this.ticking = false;
		}
		if (!this.tickRequested) return;
		this.tickRequested = false;
		await this.tick(this.now());
	}

	private async runTick(now: number): Promise<void> {
		if (!this.platformSupported()) return;
		const settings = this.state.readSettings();
		const agents = AGENTS.filter((agent) => settings[agent].enabled);
		// The lock is claimed before the enabled check, not after it: it is
		// what makes this instance the one allowed to write account state at
		// all (KTD5), and the Usage page's own actions — a manual switch, a
		// settings change — go through the same gate. Auto-switch is off by
		// default, so releasing it here would leave every fresh install a
		// lock loser that refuses its own user.
		if (!this.ensureOwnership(now)) {
			if (agents.length > 0) await this.followOwner(agents);
			return;
		}
		// Nothing to decide with every agent's auto-switch off, but the lock
		// stays claimed.
		if (agents.length === 0) return;

		const runtime = this.state.readRuntime();
		const runtimeBefore = JSON.stringify(runtime);
		const rotation = this.state.readRotation();
		// The active account is resolved first: the poll schedule, the
		// identity re-assertion and the decision all key off it.
		for (const agent of agents) await this.resolveActive(agent, runtime);

		await this.quotaStore.refreshDue(
			now,
			this.schedule(settings, runtime, agents),
		);
		// The lease is three ticks long and every await above can outlast it:
		// a provider request, an identity read, a session move. Another
		// process reclaims a stale lock by renaming it away, so from here on
		// each awaited boundary re-checks (and heartbeats) ownership, and a
		// tick that lost it writes nothing more (KTD5).
		if (!this.ensureOwnership(this.now())) return;

		if (agents.includes("claude")) {
			await this.reassertClaudeIdentity(runtime, settings.claude, now);
			if (!this.ensureOwnership(this.now())) return;
		}

		for (const agent of agents) {
			await this.evaluate(agent, settings[agent], rotation, runtime, now);
			if (!this.ensureOwnership(this.now())) return;
		}

		// A quiet tick must not rewrite the file every interval: the state dir
		// is shared with the other Superset host-services on this machine.
		if (JSON.stringify(runtime) !== runtimeBefore) {
			this.state.writeRuntime(runtime);
		}
		for (const agent of agents) {
			this.broadcastState(agent, settings[agent], runtime, now);
		}
		// Not through `handleLimitHints`: this tick already holds the mutation
		// slot, and queueing behind itself would never resolve.
		await this.limitHintPass(now, { settings, agents, runtime, rotation });
	}

	// ── Ownership (KTD5) ───────────────────────────────────────────────

	private ensureOwnership(now: number): boolean {
		// A stopped engine claims nothing and re-claims nothing: `stop()` is
		// about to hand the lock to whoever wants it next, and every awaited
		// boundary below asks this question before it writes.
		if (this.stopped) {
			this.owner = false;
			return false;
		}
		const owner = this.state.claimLock(this.nonce, now, this.lockStaleMs);
		this.owner = owner;
		if (this.ownershipApplied === owner) return owner;
		if (this.ownershipApplied === true) {
			// Said once per loss: the lock went stale under a slow tick and
			// another instance reclaimed it.
			console.warn(
				"[account-engine] another instance now owns the host lock; this tick stops here.",
			);
		}
		this.ownershipApplied = owner;
		this.applyOwnership(owner);
		return owner;
	}

	/**
	 * KTD5: everything that depends on which side of the lock this instance is
	 * on. The owner mirrors its quota store into quota.json and is the only
	 * one that records identity bindings; a loser reads that mirror instead of
	 * calling providers, and writes no runtime state at all — discovery's
	 * unlocked read-modify-write would otherwise put the owner's active
	 * account back to what it was.
	 */
	private applyOwnership(owner: boolean): void {
		this.quotaStore.setSnapshotSink(
			owner
				? (snapshot) => this.state.writeQuotaSnapshot(snapshot, this.now())
				: null,
		);
		this.quotaStore.setSnapshotSource(
			owner ? null : () => this.mirroredQuota(),
		);
		this.setBindingRecorder(owner ? null : () => {});
	}

	/** The owner's published quota mirror, or null until it publishes one. */
	private mirroredQuota(): QuotaStoreSnapshot | null {
		const data = this.state.readQuotaSnapshot()?.data as
			| QuotaStoreSnapshot
			| undefined;
		return data && Array.isArray(data.entries) ? data : null;
	}

	private releaseOwnership(): void {
		this.owner = false;
		this.ownershipApplied = null;
		// Stopped, not demoted: the store goes back to serving on-demand reads
		// the way it does with no engine at all.
		this.quotaStore.setSnapshotSink(null);
		this.quotaStore.setSnapshotSource(null);
		this.setBindingRecorder(null);
		this.state.releaseLock(this.nonce);
	}

	/**
	 * KTD5: a lock loser polls nothing and swaps nothing, but it still owns
	 * its own terminals. The shared `runtime.json` is the only notice it gets
	 * that the owner moved — two org host-services share a Superset home but
	 * not an event bus.
	 */
	private async followOwner(agents: readonly AccountAgent[]): Promise<void> {
		const runtime = this.state.readRuntime();
		for (const agent of agents) {
			const state = runtime.perAgent[agent];
			const active = `${state.activeAccountId ?? ""}\u0000${
				state.activeSelection ?? ""
			}`;
			const seen = this.followedActive.get(agent);
			this.followedActive.set(agent, active);
			if (seen === active) continue;
			if (seen === undefined) {
				// The first observation is not a baseline: this service may
				// have started long after the owner switched, and its sessions
				// would sit on the old account for as long as it runs.
				await this.reconcile(agent, state);
				continue;
			}
			await this.followExternalSwitch(agent);
		}
	}

	/**
	 * KTD12/R6 on the loser's side: a Claude session already running on the
	 * shared active dir picks the owner's new login up in place, so restarting
	 * it would throw away a live turn for nothing. The mover's own
	 * external-switch path takes every row, so the filter is applied here —
	 * the same one the owner's move uses.
	 */
	private async followExternalSwitch(agent: AccountAgent): Promise<void> {
		if (agent !== "claude") {
			await this.mover.onExternalSwitch(agent);
			return;
		}
		const activeDir = this.resolveActiveDir();
		await this.mover.moveAtIdle(
			agent,
			this.hostDeps
				.listSessions(agent)
				.filter((row) => row.configDir !== activeDir),
		);
	}

	/**
	 * KTD5: what a loser does the first time it sees the owner's state. A
	 * Claude session runs on the shared active dir and picks the new login up
	 * in place, so only Codex — whose account *is* its config dir — can be on
	 * the wrong one. Rows already on the active home are left alone, and the
	 * mover's idle rule still decides when each one moves.
	 */
	private async reconcile(
		agent: AccountAgent,
		state: RuntimeState["perAgent"][AccountAgent],
	): Promise<void> {
		if (agent !== "codex") return;
		// A runtime the owner has never written names no account at all;
		// there is nothing to reconcile against.
		if (state.activeAccountId === null && state.activeSelection === null) {
			return;
		}
		const stale = this.hostDeps
			.listSessions(agent)
			.filter((row) => row.configDir !== state.activeSelection);
		if (stale.length === 0) return;
		await this.mover.moveAtIdle(agent, stale);
	}

	// ── Accounts and scheduling ────────────────────────────────────────

	private pool(agent: AccountAgent): EngineAccount[] {
		const out: EngineAccount[] = [];
		for (const entry of this.quotaStore.entries(agent)) {
			for (const account of entry.accounts) {
				out.push({
					entry,
					account,
					row: {
						agent,
						accountId: account.accountId ?? null,
						accountKey: account.accountKey,
						selection: account.selection,
						label: labelOf(account),
						credentialKind: account.credentialKind,
						inRotation: account.inRotation,
						managed: account.managed,
						tokenState: entry.tokenState,
						windows: account.windows,
					},
				});
			}
		}
		return out;
	}

	/**
	 * The pool row for the account sessions are running on. API-billed logins
	 * carry no provider account id, so a recorded null id matches every one of
	 * them — the selection is the only thing that tells those apart, and it is
	 * what `resolveActive` records alongside the id.
	 */
	private activeRow(
		pool: EngineAccount[],
		state: RuntimeState["perAgent"][AccountAgent],
	): EngineAccount | undefined {
		return state.activeAccountId !== null
			? pool.find((item) => item.row.accountId === state.activeAccountId)
			: pool.find((item) => item.row.selection === state.activeSelection);
	}

	/** The engine's own record wins; then `isDefault`, then the host pointer. */
	private async resolveActive(
		agent: AccountAgent,
		runtime: RuntimeState,
	): Promise<void> {
		const state = runtime.perAgent[agent];
		const pool = this.pool(agent);
		// A recorded account keeps the record even when it is absent from the
		// pool — a provider read that failed, a profile dir not mounted yet.
		// The guesses below are for a state that records nothing at all;
		// substituting a plausible row for an account we simply cannot see
		// right now would point the engine at a login sessions are not on, and
		// `evaluate` already refuses to switch without a known active.
		if (state.activeAccountId !== null) {
			const known = pool.find(
				(item) => item.row.accountId === state.activeAccountId,
			);
			if (known) state.activeSelection = known.row.selection;
			return;
		}
		if (state.activeSelection !== null) return;
		const chosen =
			pool.find((item) => item.account.isDefault) ??
			(await this.pointerAccount(agent, pool));
		if (!chosen) return;
		state.activeAccountId = chosen.row.accountId;
		state.activeSelection = chosen.row.selection;
	}

	/**
	 * KTD4: the quota store's rows always carry `isDefault: false` — the
	 * Usage query decorates a copy of them, never the store — so on a first
	 * run the host pointer is what says which login sessions are on. A null
	 * pointer is the system-default login, which is the pool row whose
	 * selection is null.
	 */
	private async pointerAccount(
		agent: AccountAgent,
		pool: EngineAccount[],
	): Promise<EngineAccount | undefined> {
		let selections: DefaultAccountSelections;
		try {
			selections = this.readPointerSelections(this.db);
		} catch (error) {
			console.warn(
				"[account-engine] could not read the account pointer:",
				error,
			);
			return undefined;
		}
		const selection =
			agent === "claude" ? selections.claudeConfigDir : selections.codexHome;
		const match = pool.find((item) => item.row.selection === selection);
		if (match) return match;
		// After any Claude switch the pointer names Superset's own active dir,
		// which is never a pool row — so a host that lost runtime.json would
		// find no account here at all. The dir's own identity says which one
		// its login belongs to.
		if (agent !== "claude" || selection === null) return undefined;
		if (!samePath(selection, this.resolveActiveDir())) return undefined;
		const seen = await this.readActiveIdentitySafe(selection);
		if (!seen?.accountUuid) return undefined;
		return pool.find((item) => item.row.accountId === seen.accountUuid);
	}

	private schedule(
		settings: EngineSettings,
		runtime: RuntimeState,
		agents: readonly AccountAgent[],
	): QuotaRefreshSchedule {
		const schedule: QuotaRefreshSchedule = {};
		for (const agent of agents) {
			const state = runtime.perAgent[agent];
			// R22: while an agent is latched all-exhausted it polls slowly, but
			// never past the reset that would end the latch.
			const exhausted = state.exhaustedNotifiedAt !== null;
			const wakeAt = exhausted ? this.nearestReset(agent) : null;
			schedule[agent] = {
				activeKey: quotaEntryKey(agent, state.activeSelection),
				intervalMs: exhausted
					? EXHAUSTED_POLL_MS
					: settings[agent].pollIntervalSeconds * 1000,
				...(wakeAt === null ? {} : { wakeAt }),
			};
		}
		return schedule;
	}

	private nearestReset(agent: AccountAgent): number | null {
		let soonest: number | null = null;
		for (const item of this.pool(agent)) {
			for (const window of item.account.windows) {
				const at = window.resetsAt?.getTime();
				if (at === undefined) continue;
				if (soonest === null || at < soonest) soonest = at;
			}
		}
		return soonest;
	}

	// ── Decision and switch ────────────────────────────────────────────

	private async evaluate(
		agent: AccountAgent,
		settings: AutoSwitchSettings,
		rotation: RotationState,
		runtime: RuntimeState,
		now: number,
	): Promise<void> {
		const state = runtime.perAgent[agent];
		const pool = this.pool(agent);
		const active = this.activeRow(pool, state);
		// With nothing known about the account sessions run on there is no
		// comparison to make, and a switch would be a guess.
		if (!active) return;

		const decision = shouldSwitch({
			settings,
			active: active.row,
			candidates: this.targets(pool, active),
			rotation,
			runtime: {
				cooldownUntil: state.cooldownUntil,
				activeAccountId: state.activeAccountId,
			},
			now,
		});

		if (!decision.switch) {
			if (decision.allExhausted) state.exhaustedNotifiedAt ??= now;
			else state.exhaustedNotifiedAt = null;
			return;
		}

		await this.performSwitch({
			agent,
			settings,
			runtime,
			from: active.row,
			target: decision.target,
			reasonKind: decision.reasonKind,
			windowId: decision.windowId,
			usedPercent: decision.usedPercent,
			now,
		});
	}

	/**
	 * AE10: an account whose last fetch failed, or that has never been read,
	 * is scored from what is known but is never moved onto — a failure must
	 * not become a switch.
	 */
	private targets(
		pool: EngineAccount[],
		active: EngineAccount,
	): DecisionAccount[] {
		return pool
			.filter(
				(item) =>
					item !== active &&
					item.entry.fetchedAt !== null &&
					eligibleForSwitch(item.entry),
			)
			.map((item) => item.row);
	}

	private async performSwitch(
		input: PerformSwitchInput,
	): Promise<ManualSwitchOutcome> {
		const { agent, runtime, now } = input;
		const state = runtime.perAgent[agent];
		// KTD5: the credential swap and the pointer write are host-wide, so
		// the lease is re-checked immediately before them and again before the
		// state they leave behind.
		if (!this.ensureOwnership(this.now())) return LOCK_LOSER;
		// The config dirs sessions were *launched* from, read before the
		// pointer moves. Afterwards an unpinned session resolves to the active
		// dir and the filter below would read it as already moved.
		const launched = this.hostDeps.listSessions(agent);
		const result =
			agent === "claude"
				? await this.switchClaude(input)
				: this.switchCodex(input);

		if (!result.ok) {
			// R24: nothing moved. The previous login is still in place and the
			// sessions on it keep working.
			this.broadcastState(agent, input.settings, runtime, now, {
				lastSwitchFailure: { code: result.code, at: now },
			});
			return result;
		}

		if (!this.ensureOwnership(this.now())) return LOCK_LOSER;
		// R8: the limit-stopped session comes back before the row and the
		// event that claim it did. It is also what puts that session on the
		// new account, so it runs here rather than after the planned move —
		// which leaves it alone (KTD8).
		const restarted =
			input.fallbackRestart === undefined
				? false
				: await input.fallbackRestart();
		state.activeAccountId = input.target.accountId;
		state.activeSelection = input.target.selection;
		state.cooldownUntil = now + input.settings.cooldownSeconds * 1000;
		state.exhaustedNotifiedAt = null;
		if (input.reasonKind === "fallback") {
			state.fallbackTimestamps = [
				...state.fallbackTimestamps.filter((at) => now - at < HOUR_MS),
				now,
			];
		}
		const entry = this.historyEntry(input, restarted);
		try {
			this.state.appendHistory(entry);
		} catch (error) {
			// The switch has already happened. A row that could not be appended
			// is a lost line in a log, not a reason to leave the runtime state
			// and the sessions behind on the previous account.
			console.warn(
				"[account-engine] could not record the switch in history:",
				error,
			);
		}
		this.state.writeRuntime(runtime);
		this.broadcast.switched(switchedPayload(entry));
		if (!this.ensureOwnership(this.now())) return { ok: true };
		await this.moveSessions(
			agent,
			result.activeDir ?? null,
			input.excludeTerminalId ?? null,
			launched,
		);
		return { ok: true };
	}

	private historyEntry(
		input: PerformSwitchInput,
		fallbackRestart: boolean,
	): SwitchRecord {
		return {
			at: input.now,
			agent: input.agent,
			fromAccountId: input.from?.accountId ?? null,
			fromLabel: input.from?.label ?? null,
			toAccountId: input.target.accountId,
			toLabel: input.target.label,
			reasonKind: input.reasonKind,
			windowId: input.windowId,
			usedPercent: input.usedPercent,
			fallbackRestart,
		};
	}

	private async switchClaude(
		input: PerformSwitchInput,
	): Promise<SwitchOutcome & { activeDir?: string }> {
		let activeDir: string;
		try {
			activeDir = await this.ensureActiveDir({
				seedLogin: (dir) => this.seedActiveDir(dir, input),
			});
		} catch (error) {
			return {
				ok: false,
				code: "active-dir-unavailable",
				reason: errorText(error),
			};
		}

		const ownerBinding = this.ownerBinding(input.runtime, input.from);
		if (!ownerBinding) {
			return {
				ok: false,
				code: "owner-unknown",
				reason:
					"No account is bound to the login in the active dir, and the identity scan was ambiguous.",
			};
		}

		const result = await this.swap({
			target: storeRef(input.target.selection),
			ownerBinding,
			// The binding as an identity, so the swap can refuse a save-back
			// into the wrong dir after a `/login` inside a live session.
			expectedOwnerAccountId: input.from?.accountId ?? null,
			// A hand-exported dir is read, never written: the login it holds
			// is not Superset's to save back.
			ownerManaged: input.from?.managed ?? true,
			activeDir,
		});
		if (!result.ok) {
			// Split state: the active dir holds the target's credential under
			// the previous identity, so what we last wrote no longer describes
			// it. Forget it, and the next tick reads the dir as externally
			// changed rather than re-asserting a stale identity block (KTD3).
			if (result.code === "split-state") this.lastWritten = null;
			return { ok: false, code: result.code, reason: result.reason };
		}

		this.recordBinding(
			input.runtime,
			result.identity.accountUuid,
			input.target.selection,
		);
		try {
			this.setPointer(this.db, "claude", activeDir);
		} catch (error) {
			// R24 says a failed switch changes nothing, and the swap above has
			// already changed the active dir. Put the previous login back
			// through the same primitive before reporting the failure;
			// otherwise the sessions are on an account nothing recorded.
			const restored = await this.restorePreviousLogin(input, activeDir);
			if (restored) {
				return { ok: false, code: "pointer-failed", reason: errorText(error) };
			}
			// Neither half took: the active dir holds the target's login and
			// the pointer still names the old one. Forget what we wrote so the
			// next tick reads the dir as externally changed (KTD3).
			this.lastWritten = null;
			return {
				ok: false,
				code: "split-state",
				reason: `the account pointer could not be moved (${errorText(error)}) and the previous login could not be put back`,
			};
		}
		// Remember what we wrote so the next tick can tell a running Claude
		// Code's identity rewrite from a real login change (KTD3).
		const seen = await this.readActiveIdentitySafe(activeDir);
		this.lastWritten = {
			accountUuid: result.identity.accountUuid,
			credentialHash: seen?.credentialHash ?? null,
			keys: result.identity.keys,
		};
		return { ok: true, activeDir };
	}

	private switchCodex(
		input: PerformSwitchInput,
	): SwitchOutcome & { activeDir?: string } {
		try {
			this.setPointer(this.db, "codex", input.target.selection);
		} catch (error) {
			return { ok: false, code: "pointer-failed", reason: errorText(error) };
		}
		return { ok: true };
	}

	/**
	 * The swap that undoes a swap: same primitive, same direction, target and
	 * owner exchanged. Only the login moves — the pointer never did.
	 */
	private async restorePreviousLogin(
		input: PerformSwitchInput,
		activeDir: string,
	): Promise<boolean> {
		const from = input.from;
		if (!from) return false;
		const result = await this.swap({
			target: storeRef(from.selection),
			ownerBinding: storeRef(input.target.selection),
			expectedOwnerAccountId: input.target.accountId,
			ownerManaged: input.target.managed,
			activeDir,
		});
		if (!result.ok) return false;
		this.recordBinding(
			input.runtime,
			result.identity.accountUuid,
			from.selection,
		);
		return true;
	}

	private async seedActiveDir(
		dir: string,
		input: PerformSwitchInput,
	): Promise<void> {
		// KTD14: a brand-new active dir starts from the login every session is
		// already running on — which on a host upgraded into this feature is
		// whatever the pointer selects, not necessarily `~/.claude`. Seeding
		// from the system default there would save the wrong credential back
		// over the selected profile on the first swap.
		const source = input.from?.selection ?? null;
		const result = await this.seed({
			source: storeRef(source),
			activeDir: dir,
		});
		if (result.ok)
			this.recordBinding(input.runtime, result.identity.accountUuid, source);
	}

	private recordBinding(
		runtime: RuntimeState,
		accountUuid: string | null,
		selection: string | null,
	): void {
		if (accountUuid === null) return;
		runtime.identityBindings[accountUuid] = selection;
	}

	/**
	 * KTD3 step 2: which store owns the login currently in the active dir.
	 * Recorded bindings answer it; on a first swap (or after a lost
	 * runtime.json) the store's own accounts do. Ambiguity is a refusal, not
	 * a guess — saving A's refreshed token into B's dir signs B out.
	 */
	private ownerBinding(
		runtime: RuntimeState,
		from: DecisionAccount | null,
	): ClaudeLoginStoreRef | undefined {
		const accountId = from?.accountId ?? null;
		if (accountId === null) return undefined;
		if (accountId in runtime.identityBindings) {
			return storeRef(runtime.identityBindings[accountId] ?? null);
		}
		const dirs = new Set(
			this.pool("claude")
				.filter((item) => item.row.accountId === accountId)
				.map((item) => item.row.selection),
		);
		if (dirs.size !== 1) return undefined;
		const dir = [...dirs][0] ?? null;
		runtime.identityBindings[accountId] = dir;
		return storeRef(dir);
	}

	/**
	 * KTD12/R6: a Claude session already running on the active dir picks the
	 * new login up in place — restarting it would throw away a live turn for
	 * nothing. Everything else moves at idle.
	 */
	private async moveSessions(
		agent: AccountAgent,
		activeDir: string | null,
		excludeTerminalId: string | null = null,
		/** Rows as they were before the pointer moved; see `performSwitch`. */
		launched: MovableSession[] = this.hostDeps.listSessions(agent),
	): Promise<void> {
		const rows = launched.filter((row) => row.terminalId !== excludeTerminalId);
		const moving =
			agent === "claude" && activeDir !== null
				? rows.filter((row) => row.configDir !== activeDir)
				: rows;
		await this.mover.moveAtIdle(agent, moving);
	}

	// ── Identity re-assertion (KTD3, KTD4) ─────────────────────────────

	private async reassertClaudeIdentity(
		runtime: RuntimeState,
		settings: AutoSwitchSettings,
		now: number,
	): Promise<void> {
		const state = runtime.perAgent.claude;
		const expected = state.activeAccountId;
		if (expected === null) return;
		const activeDir = this.resolveActiveDir();
		const seen = await this.readActiveIdentitySafe(activeDir);
		if (!seen || seen.accountUuid === null || seen.accountUuid === expected) {
			return;
		}
		// The read above is the awaited boundary; everything below writes.
		if (!this.ensureOwnership(this.now())) return;

		const written = this.lastWritten;
		if (
			written !== null &&
			written.credentialHash !== null &&
			written.credentialHash === seen.credentialHash
		) {
			// The credential is still the one we wrote, so only the identity
			// block drifted: a running Claude Code rewrote `.claude.json` from
			// memory. Put our block back and leave the active account alone.
			try {
				await this.writeClaudeState(claudeStatePath(activeDir), (existing) => ({
					...existing,
					...written.keys,
				}));
			} catch (error) {
				console.warn(
					"[account-engine] could not re-assert the active identity:",
					error,
				);
			}
			return;
		}

		// A credential we did not write: someone signed in behind us (a
		// `/login` inside a session, or another tool). Adopt it so the next
		// swap saves it back to the right dir rather than to the wrong one.
		const pool = this.pool("claude");
		const adopted = pool.find(
			(item) => item.row.accountId === seen.accountUuid,
		);
		const from = pool.find((item) => item.row.accountId === expected);
		state.activeAccountId = seen.accountUuid;
		state.activeSelection = adopted?.row.selection ?? null;
		// The same cooldown a manual switch starts: someone just chose this
		// login by hand, and `evaluate` runs later in this very tick — without
		// it the engine could switch straight back off the account the user
		// signed into.
		state.cooldownUntil = now + settings.cooldownSeconds * 1000;
		state.exhaustedNotifiedAt = null;
		this.lastWritten = null;
		const entry: SwitchRecord = {
			at: now,
			agent: "claude",
			fromAccountId: expected,
			fromLabel: from?.row.label ?? null,
			toAccountId: seen.accountUuid,
			toLabel: adopted?.row.label ?? null,
			reasonKind: "external",
			windowId: null,
			usedPercent: null,
			fallbackRestart: false,
		};
		this.state.appendHistory(entry);
		this.broadcast.switched(switchedPayload(entry));
	}

	private async readActiveIdentitySafe(
		activeDir: string,
	): Promise<ActiveDirIdentity | null> {
		try {
			return await this.readActiveIdentity(activeDir);
		} catch (error) {
			console.warn("[account-engine] could not read the active dir:", error);
			return null;
		}
	}

	// ── Limit stops (KTD7) ─────────────────────────────────────────────

	/**
	 * R8. A hint says which terminal to look at and nothing more. The gates
	 * run cheapest-first: the local rate limits cost nothing, the terminal
	 * snapshot costs no provider call, and the quota refresh goes through the
	 * store so it honours the poll floor and the 429 back-off.
	 */
	async handleLimitHints(now: number = this.now()): Promise<void> {
		// A hint arrives on the store's change signal, which is nothing to do
		// with the tick: it waits for whatever the tick is doing rather than
		// switching against a runtime snapshot that is about to be rewritten.
		return this.serialize(() => this.limitHintPass(now));
	}

	private async limitHintPass(
		now: number,
		loaded?: LimitHintPass,
	): Promise<void> {
		if (this.handlingHints) return;
		this.handlingHints = true;
		try {
			await this.runLimitHints(now, loaded);
		} catch (error) {
			console.warn("[account-engine] limit-stop handling failed:", error);
		} finally {
			this.handlingHints = false;
		}
	}

	private async runLimitHints(
		now: number,
		loaded?: LimitHintPass,
	): Promise<void> {
		if (!this.platformSupported()) return;
		// The tick hands its own state down; a standalone pass off the session
		// subscription has to read it (and claim the lock) for itself.
		const pass = loaded ?? this.loadLimitHintPass(now);
		if (!pass) return;
		const { settings, agents, runtime, rotation } = pass;
		for (const agent of agents) {
			await this.resolveActive(agent, runtime);
			for (const row of this.hostDeps.listSessions(agent)) {
				if (!row.managed || !this.isLimitHint(row)) continue;
				await this.handleHint(row, settings, rotation, runtime, now);
			}
		}
	}

	private loadLimitHintPass(now: number): LimitHintPass | null {
		const settings = this.state.readSettings();
		const agents = AGENTS.filter((agent) => settings[agent].enabled);
		if (agents.length === 0) return null;
		if (!this.ensureOwnership(now)) return null;
		return {
			settings,
			agents,
			runtime: this.state.readRuntime(),
			rotation: this.state.readRotation(),
		};
	}

	private isLimitHint(row: MovableSession): boolean {
		return row.agent === "claude"
			? row.limitHintErrorType === CLAUDE_RATE_LIMIT_HINT
			: // KTD7: Codex reports nothing when a turn dies on a limit, so a busy
				// row is the hint; the mover reads a screen only once that account's
				// window is at or over 100%.
				this.hostDeps.isAgentBusy(row.terminalId);
	}

	private async handleHint(
		row: MovableSession,
		allSettings: EngineSettings,
		rotation: RotationState,
		runtime: RuntimeState,
		now: number,
	): Promise<void> {
		const agent = row.agent;
		const settings = allSettings[agent];
		const state = runtime.perAgent[agent];
		// A Claude hint is one hook event: acting on it twice would be acting
		// on the same stop twice. A Codex stall has no event to key on and is
		// re-checked instead, behind the mover's own gates.
		const key = `${agent}:${row.terminalId}:${row.lastEventAt}`;
		if (agent === "claude") {
			if (this.handledHints.has(key)) return;
			// Bounded: the set only exists to stop one hook event being acted
			// on twice, so forgetting the oldest costs nothing.
			if (this.handledHints.size > 200) this.handledHints.clear();
			this.handledHints.add(key);
		}

		const active = this.activeRow(this.pool(agent), state);
		if (!active) return;

		// Gate 1: the local rate limits, before any snapshot or provider call.
		if (
			!fallbackAllowed({
				cooldownUntil: state.cooldownUntil,
				fallbackTimestamps: state.fallbackTimestamps,
				now,
			})
		) {
			this.recordRejectedHint(agent, active.row, now);
			return;
		}

		// Gate 2: the host reads the terminal's own screen. Nothing here
		// reaches a provider, so a forged hint is turned down before it can
		// cost a request. Codex's stall is only allowed to open a screen once
		// its own numbers say the account is spent; Claude's hook event is its
		// own permission (see SNAPSHOT_ONLY_WINDOWS).
		const corroborated = await this.mover.corroborateLimitStop(
			row,
			agent === "claude" ? SNAPSHOT_ONLY_WINDOWS : active.account.windows,
		);
		if (!corroborated) {
			this.recordRejectedHint(agent, active.row, now);
			return;
		}

		// Gate 3: fresh numbers, through the store so a hint storm cannot
		// become a fetch storm — and read *after* the screen corroborated,
		// because a limit reached between two polls is still a real limit.
		await this.quotaStore.refreshDue(
			now,
			this.schedule(allSettings, runtime, [agent]),
		);
		if (!this.ensureOwnership(this.now())) return;

		const pool = this.pool(agent);
		const from = this.activeRow(pool, state) ?? active;
		if (!from.row.windows.some((window) => window.usedPercent >= 100)) {
			// The screen said "limit" but the account has room: a stale screen,
			// or a limit that has already reset.
			this.recordRejectedHint(agent, from.row, now);
			return;
		}
		const usable = this.targets(pool, from).filter(
			(candidate) =>
				isEligible(candidate, rotation) &&
				!isNearLimit(
					scoreAccount(candidate, settings.modelWindows),
					settings.thresholdPercent,
				),
		);
		const target = pickBest(usable, settings.modelWindows);
		if (!target) {
			// R8/R22: no eligible account, so no restart — a relaunch onto a
			// spent account would just stop again.
			state.exhaustedNotifiedAt ??= now;
			this.state.writeRuntime(runtime);
			this.broadcastState(agent, settings, runtime, now);
			return;
		}

		const worst = worstWindow(from.row, settings.modelWindows);
		await this.performSwitch({
			agent,
			settings,
			runtime,
			from: from.row,
			target,
			reasonKind: "fallback",
			windowId: worst?.id ?? null,
			usedPercent: worst?.usedPercent ?? null,
			now,
			// Run by the switch itself, once the pointer moved and before the
			// history row that reports whether it worked.
			fallbackRestart: () => this.mover.fallbackRestart(row),
			excludeTerminalId: row.terminalId,
		});
	}

	/** KTD7: a hint the gates turned down is recorded, never acted on. */
	private recordRejectedHint(
		agent: AccountAgent,
		active: DecisionAccount,
		now: number,
	): void {
		// Only Claude's hint is an explicit provider signal worth a row; a
		// Codex stall that fails corroboration is ordinary and would flood.
		if (agent !== "claude") return;
		this.state.appendHistory({
			at: now,
			agent,
			fromAccountId: active.accountId,
			fromLabel: active.label,
			toAccountId: active.accountId,
			toLabel: active.label,
			reasonKind: "fallback-rejected",
			windowId: null,
			usedPercent: null,
			fallbackRestart: false,
		});
	}

	// ── Broadcast ──────────────────────────────────────────────────────

	private broadcastState(
		agent: AccountAgent,
		settings: AutoSwitchSettings,
		runtime: RuntimeState,
		now: number,
		extra?: Partial<AccountEngineStatePayload>,
	): void {
		const state = runtime.perAgent[agent];
		const payload: AccountEngineStatePayload = {
			scope: agent,
			agent,
			enabled: settings.enabled,
			activeAccountId: state.activeAccountId,
			cooldownUntil: state.cooldownUntil,
			exhausted: state.exhaustedNotifiedAt !== null,
			lockOwner: this.owner,
			occurredAt: now,
			...extra,
		};
		if (extra === undefined) {
			// Steady state goes out only when it changes: an open Usage page
			// should not be woken every tick to be told nothing happened.
			const key = JSON.stringify({ ...payload, occurredAt: 0 });
			if (this.lastState.get(agent) === key) return;
			this.lastState.set(agent, key);
		}
		this.broadcast.engineState(payload);
	}

	private platformSupported(): boolean {
		return this.platform !== "win32";
	}
}

/** The `account:switched` event of a completed switch: the history row plus
 * the bus's filter key, so the two can never drift apart. */
function switchedPayload(entry: SwitchRecord): AccountSwitchedPayload {
	return { scope: entry.agent, ...entry };
}

/** Two paths naming the same dir. Lexical only: the pointer and the active
 * dir are both written by this process, so trailing slashes and `.` segments
 * are the whole difference to expect. */
function samePath(a: string, b: string): boolean {
	return resolvePath(a) === resolvePath(b);
}

function storeRef(selection: string | null): ClaudeLoginStoreRef {
	// KTD14: `null` is the system-default login, whose store is `~/.claude`.
	return selection === null
		? { kind: "system-default" }
		: { kind: "profile", dir: selection };
}
