/**
 * The switch decision, as pure functions (KTD11).
 *
 * Nothing here reads a file, calls a provider or knows what a swap is: it
 * takes the accounts the quota store already holds and answers one question —
 * should this agent move, and onto which account. That separation is what
 * makes both strategies, the hysteresis rule and the exhaustion outcome
 * testable without a host, and it is why the engine's own tests can stay
 * about orchestration rather than arithmetic.
 *
 * Two rules are easy to get backwards, so they are stated here once:
 *
 *  - A *score* is headroom, not usage. 100 is an untouched account, 0 is a
 *    spent one, and "near its limit" is a score at or under the headroom the
 *    threshold leaves (`100 - threshold`).
 *  - The hysteresis margin only guards a *proactive* move. Once the active
 *    account is at or over the threshold, the margin is lifted (R15) —
 *    otherwise a user with two nearly-equal accounts would sit at the limit
 *    watching the engine decline to move.
 */

import { accountRotationKey } from "@superset/shared/account-rotation";
import type {
	UsageAccountCredentialKind,
	UsageQuotaWindow,
} from "../trpc/router/usage/types.ts";
import type { QuotaTokenState } from "./quota-store.ts";
import type {
	AccountAgent,
	AutoSwitchSettings,
	RotationState,
} from "./types.ts";

/** R15: how far a candidate must beat the active account for a proactive move. */
export const DEFAULT_HYSTERESIS_MARGIN = 10;

/**
 * The account-wide windows per agent (R11). Every other window an account
 * reports is model-scoped and joins the score only when the user configured
 * that model (R13).
 */
const ACCOUNT_WIDE_WINDOW_IDS: Record<AccountAgent, readonly string[]> = {
	claude: ["five_hour", "seven_day"],
	codex: ["primary", "secondary"],
};

/**
 * The longest-period windows per agent — Claude's weekly, Codex's secondary
 * (R12). `consume-first` orders accounts by when this one resets, so they are
 * matched by prefix: `seven_day_sonnet` still belongs to the weekly period
 * when a plan reports no plain `seven_day`, and so does a per-model
 * `weekly_scoped:Fable`, which on some plans is the only weekly window
 * reported at all — without it consume-first would have no reset to rank by.
 */
const LONGEST_PERIOD_WINDOW_PREFIXES: Record<AccountAgent, readonly string[]> =
	{
		claude: ["seven_day", "weekly_scoped:"],
		codex: ["secondary"],
	};

/**
 * One candidate as the engine hands it to the decision. It is deliberately
 * not `UsageAccount`: the decision needs the token state the quota entry
 * knows (R23) and never needs a fetch timestamp or a source label.
 */
export interface DecisionAccount {
	agent: AccountAgent;
	/** The provider's account identity (R5); null before it is ever read. */
	accountId: string | null;
	/** Stable key for the credential source, used when there is no identity. */
	accountKey: string;
	/** Profile dir to run on; null is the system-default login (KTD14). */
	selection: string | null;
	/** Display label only — never an address the engine composes text from. */
	label: string | null;
	credentialKind: UsageAccountCredentialKind;
	/** R16, as the account itself reports it (API-key logins default out). */
	inRotation: boolean;
	/** Whether Superset may write this login's store. False for a config dir
	 * the user exported by hand, which is read but never switched onto. */
	managed: boolean;
	tokenState: QuotaTokenState;
	windows: readonly UsageQuotaWindow[];
}

/** The runtime facts a decision needs; the rest of the latch state does not
 * change what `shouldSwitch` answers. */
export interface DecisionRuntime {
	cooldownUntil: number | null;
	activeAccountId: string | null;
}

export interface ShouldSwitchInput {
	settings: AutoSwitchSettings;
	active: DecisionAccount;
	/** Every other account of this agent, eligible or not. */
	candidates: readonly DecisionAccount[];
	rotation: RotationState;
	runtime: DecisionRuntime;
	now: number;
	hysteresisMargin?: number;
}

export type SwitchDecision =
	| {
			switch: false;
			/** R22: no eligible account has room, so the engine latches. */
			allExhausted: boolean;
	  }
	| {
			switch: true;
			target: DecisionAccount;
			reasonKind: "threshold" | "strategy";
			/** The active account's worst window — the number that explains
			 * "why now" to the user (R19). Null when it reports none. */
			windowId: string | null;
			usedPercent: number | null;
	  };

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * KTD11: model names match the provider's display names case-insensitively,
 * as claude-swap does. A window is matched on its id or its label so both
 * `seven_day_sonnet` and `weekly_scoped:Fable` are reachable by the model
 * name alone.
 */
function matchesModel(
	window: UsageQuotaWindow,
	modelWindows: readonly string[],
): boolean {
	const id = normalize(window.id);
	const label = normalize(window.label);
	return modelWindows.some((model) => {
		const name = normalize(model);
		return name.length > 0 && (id.includes(name) || label.includes(name));
	});
}

/**
 * The windows a decision may judge an account by: the agent's account-wide
 * windows, plus per-model windows for models the user actually configured. A
 * model-scoped window for an unconfigured model is not evidence about the
 * account — the proactive path has always excluded it, and the limit-stop
 * fallback has to agree or the two paths disagree about whether the same
 * account is spent.
 */
export function windowsInScope(
	agent: AccountAgent,
	windows: readonly UsageQuotaWindow[],
	modelWindows: readonly string[],
): readonly UsageQuotaWindow[] {
	const accountWide = ACCOUNT_WIDE_WINDOW_IDS[agent];
	return windows.filter(
		(window) =>
			accountWide.includes(window.id) || matchesModel(window, modelWindows),
	);
}

/** The windows this account is scored on: account-wide plus configured. */
export function relevantWindows(
	account: DecisionAccount,
	modelWindows: readonly string[],
): readonly UsageQuotaWindow[] {
	return windowsInScope(account.agent, account.windows, modelWindows);
}

/** The window with the least headroom — what a switch notification names. */
export function worstWindow(
	account: DecisionAccount,
	modelWindows: readonly string[],
): UsageQuotaWindow | null {
	let worst: UsageQuotaWindow | null = null;
	for (const window of relevantWindows(account, modelWindows)) {
		if (!worst || window.usedPercent > worst.usedPercent) worst = window;
	}
	return worst;
}

/**
 * Headroom of the account: the minimum across its relevant windows. An
 * account that reports no windows scores 100 — an API-key login really does
 * have no window to run out of (R16), and the engine never offers an account
 * it has failed to read as a target in the first place (AE10).
 */
export function scoreAccount(
	account: DecisionAccount,
	modelWindows: readonly string[],
): number {
	const worst = worstWindow(account, modelWindows);
	return worst === null ? 100 : 100 - worst.usedPercent;
}

/** R11: the active account is near its limit at this much headroom or less. */
export function isNearLimit(score: number, thresholdPercent: number): boolean {
	return score <= 100 - thresholdPercent;
}

/**
 * R16/R23. Managed, in rotation and signed in. The rotation file wins over
 * the flag the account carries, because that file is what the user's toggle
 * writes. `accountRotationKey` is the spelling both the renderer and the
 * router use, so it is looked up first; the bare `accountId`, the
 * `accountKey` and the selection-based spelling follow it as spellings a
 * toggle may still be filed under.
 */
export function isEligible(
	account: DecisionAccount,
	rotation: RotationState,
	tokenState: QuotaTokenState = account.tokenState,
): boolean {
	// `unavailable` is a read that did not land (endpoint error, timeout, no
	// windows). Its zero windows would score a full 100 headroom, so without
	// this an automatic switch lands on the one account nobody could read. It
	// stays a manual target.
	if (
		tokenState === "token_expired" ||
		tokenState === "signed_out" ||
		tokenState === "unavailable"
	) {
		return false;
	}
	// A dir the user exported by hand is Superset's to read, never to write:
	// it is listed and usable, but no switch targets it — not even one the
	// rotation file says yes to.
	if (!account.managed) return false;
	return rotationFlag(account, rotation);
}

/**
 * R16: the flag `accountRotationKey` stands for. An account spells its key on
 * `selection` — or on "default", for the system-default login, which has
 * neither — until its identity is read, and on `accountId` after (an auth
 * refresh writing `account_id`, a default-login read that failed once), so a
 * toggle filed before that read is still what the user chose.
 *
 * It is exported because the row the renderer draws has to resolve the same
 * spellings this decision does: a switch labelled "In rotation" reading ON for
 * an account `isEligible` refuses is a UI that contradicts the engine.
 *
 * It resolves the rotation PREFERENCE — key spellings only — and is deliberately
 * not an eligibility check. `isEligible` also refuses an unmanaged dir and a
 * token that is expired, signed out or unreadable; none of those belong here,
 * because this value is the choice the user saved, not what the engine would do
 * this second. Gating on them would make a toggle someone set ON read OFF while
 * a token happened to be expired, and flip back later on its own.
 *
 * Those gates are the card's job and are already discharged there: the toggle is
 * not rendered at all for an unmanaged row, which carries the "Unmanaged" badge
 * and footer line instead, and an unusable token shows its own status badge. See
 * `an unmanaged login offers no way to switch onto it` and `an unmanaged login
 * says Superset will not touch it` in the usage view's tests.
 */
export function resolveRotationFlag(
	account: {
		agent: string;
		accountId: string | null;
		selection: string | null;
	},
	rotation: RotationState,
	fallback: boolean,
): boolean {
	const key = accountRotationKey(account);
	if (key in rotation) return rotation[key] === true;
	const preIdentityKey = accountRotationKey({ ...account, accountId: null });
	if (preIdentityKey in rotation) return rotation[preIdentityKey] === true;
	return fallback;
}

function rotationFlag(
	account: DecisionAccount,
	rotation: RotationState,
): boolean {
	// The key and pre-identity spellings are `resolveRotationFlag`'s pair — the
	// row the renderer draws resolves the same two, so the toggle it shows
	// cannot disagree with the eligibility decided here. The bare `accountId`
	// and `accountKey` tiers are defensive and sit between them: no in-tree
	// writer produces them, so they are only reached when neither of the pair
	// is filed.
	const key = accountRotationKey(account);
	if (key in rotation) return rotation[key] === true;
	if (account.accountId !== null && account.accountId in rotation) {
		return rotation[account.accountId] === true;
	}
	if (account.accountKey in rotation)
		return rotation[account.accountKey] === true;
	return resolveRotationFlag(account, rotation, account.inRotation);
}

/** The account with the most headroom; ties break on `accountKey` so the
 * same input always produces the same switch. */
export function pickBest(
	accounts: readonly DecisionAccount[],
	modelWindows: readonly string[],
): DecisionAccount | null {
	let best: DecisionAccount | null = null;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const account of accounts) {
		const score = scoreAccount(account, modelWindows);
		if (
			score > bestScore ||
			(score === bestScore &&
				best !== null &&
				account.accountKey < best.accountKey)
		) {
			best = account;
			bestScore = score;
		}
	}
	return best;
}

function longestPeriodResetAt(
	account: DecisionAccount,
	now: number,
): number | null {
	const prefixes = LONGEST_PERIOD_WINDOW_PREFIXES[account.agent];
	let soonest: number | null = null;
	for (const window of account.windows) {
		if (window.resetsAt === null) continue;
		if (!prefixes.some((prefix) => window.id.startsWith(prefix))) continue;
		const at = window.resetsAt.getTime();
		// An unparseable `resets_at` from the provider gives an Invalid Date, and
		// its NaN would take the `soonest === null` pass and then lose every later
		// comparison — leaving the account unrankable instead of unknown. Dropping
		// the window matches `trpc/router/usage/agy-quota.ts`, which already
		// normalises this same field for this same type.
		if (!Number.isFinite(at)) continue;
		// A reset already in the past is stale data, not the soonest reset: the
		// window has rolled over and the account should be drained last.
		if (at <= now) continue;
		if (soonest === null || at < soonest) soonest = at;
	}
	return soonest;
}

/**
 * R12: drain the account whose longest window resets soonest, so the quota
 * that is about to be given back is the quota that gets spent. An account
 * whose longest window is unknown sorts last — it cannot be shown to reset
 * sooner than one that reports a time.
 */
export function pickConsumeFirst(
	accounts: readonly DecisionAccount[],
	now: number,
): DecisionAccount | null {
	let best: DecisionAccount | null = null;
	let bestAt = Number.POSITIVE_INFINITY;
	for (const account of accounts) {
		const at = longestPeriodResetAt(account, now) ?? Number.POSITIVE_INFINITY;
		// The tie also has to take the first candidate: when every reset is
		// unknown every `at` is Infinity, and a tie-break that only ever
		// replaces an existing `best` would pick nobody and report the agent
		// exhausted while a candidate still has headroom to drain.
		if (
			at < bestAt ||
			(at === bestAt && (best === null || account.accountKey < best.accountKey))
		) {
			best = account;
			bestAt = at;
		}
	}
	return best;
}

/**
 * A target of last resort: an account the strategy cannot rank against the
 * ones it can read, because the number it orders by is missing rather than
 * good. `best` scores windows, so it is an account that reports none — an
 * API-billed login by construction (R16), and a stale access token that
 * skipped the usage endpoint with no earlier read to carry — which scores a
 * full 100 and beats every account whose usage we actually know. consume-first
 * ranks by the longest window's reset instead, so what it cannot rank is the
 * metered login: no window means no reset, which ties every unknown reset at
 * Infinity and wins the accountKey tie-break. Either would take the user off
 * an account that still has room, so both strategies keep them for when the
 * active account is at its limit and nothing else is left.
 *
 * It asks `relevantWindows`, not `windows`, because the score is what makes an
 * account unrankable: an account whose only window is model-scoped for a model
 * the user did not configure reports one window and is still scored on none, so
 * it too scores a full 100 with nothing behind it.
 */
export function reportsNoWindows(
	account: DecisionAccount,
	modelWindows: readonly string[],
): boolean {
	return relevantWindows(account, modelWindows).length === 0;
}

export function isMetered(account: DecisionAccount): boolean {
	return account.credentialKind === "api_key";
}

/** The candidates that are not a last resort — or all of them, when a last
 * resort is all there is. */
export function preferRanked(
	candidates: readonly DecisionAccount[],
	lastResort: (account: DecisionAccount) => boolean,
): readonly DecisionAccount[] {
	const ranked = candidates.filter((candidate) => !lastResort(candidate));
	return ranked.length > 0 ? ranked : candidates;
}

/**
 * The whole decision (R11 to R15). Returns the target and the reason, or the
 * reason there is none — `allExhausted` being the outcome R22 latches on.
 */
export function shouldSwitch(input: ShouldSwitchInput): SwitchDecision {
	const { settings, active, rotation, runtime, now } = input;
	const stay = (allExhausted: boolean): SwitchDecision => ({
		switch: false,
		allExhausted,
	});

	if (!settings.enabled) return stay(false);
	// R15: the cooldown is checked before anything else, so a run of crossings
	// cannot become a run of switches (AE6).
	if (runtime.cooldownUntil !== null && now < runtime.cooldownUntil) {
		return stay(false);
	}

	const margin = input.hysteresisMargin ?? DEFAULT_HYSTERESIS_MARGIN;
	const models = settings.modelWindows;
	const eligible = input.candidates.filter(
		(candidate) =>
			candidate.accountKey !== active.accountKey &&
			isEligible(candidate, rotation),
	);

	const activeScore = scoreAccount(active, models);
	const activeNearLimit = isNearLimit(activeScore, settings.thresholdPercent);
	const worst = worstWindow(active, models);
	const move = (
		target: DecisionAccount,
		reasonKind: "threshold" | "strategy",
	): SwitchDecision => ({
		switch: true,
		target,
		reasonKind,
		windowId: worst?.id ?? null,
		usedPercent: worst?.usedPercent ?? null,
	});

	if (settings.strategy === "consume-first") {
		// R12/KTD11: the floor is the user's threshold, the same rule that
		// decides when to leave — an account already at it has nothing left to
		// drain, and landing on it would only be a move straight back off it.
		const withRoom = eligible.filter(
			(candidate) =>
				!isNearLimit(
					scoreAccount(candidate, models),
					settings.thresholdPercent,
				),
		);
		// Two last resorts, in this order. Both tie every unknown reset at
		// Infinity and win the accountKey tie-break, so either would take the
		// user off an account that still has room. The tiers are nested rather
		// than one `a || b` predicate because the order matters: a plan account
		// we merely could not rank still beats moving the user onto per-token
		// billing, and flattening them would put both in the same bucket and let
		// the alphabetical tie-break choose the metered login.
		const rankable = preferRanked(withRoom, (candidate) =>
			reportsNoWindows(candidate, models),
		);
		const target = pickConsumeFirst(preferRanked(rankable, isMetered), now);
		if (!target) return stay(activeNearLimit);
		if (activeNearLimit) return move(target, "threshold");
		// The last-resort tier is a fallback, not a gate: when the unrankable
		// candidate is the only one, `preferRanked` hands it back anyway. The
		// active account is not at its limit yet, so — exactly as `best` does —
		// there is nothing to buy by moving onto an account we cannot rank.
		if (reportsNoWindows(target, models)) return stay(false);
		// R12: a proactive move only pays when the target's longest window
		// really does reset before the active account's. Without this the pair
		// swap every time the cooldown expires, since `eligible` excludes the
		// active account and so the account just left always wins the next
		// tick. An unknown reset sorts last on either side, as it does in
		// pickConsumeFirst, so it never wins the comparison.
		const activeResetAt =
			longestPeriodResetAt(active, now) ?? Number.POSITIVE_INFINITY;
		const targetResetAt =
			longestPeriodResetAt(target, now) ?? Number.POSITIVE_INFINITY;
		if (targetResetAt < activeResetAt) return move(target, "strategy");
		return stay(false);
	}

	// `best`: only ever land on an account that is not itself near its limit,
	// so a switch buys real headroom rather than moving the stop by a minute.
	const below = eligible.filter(
		(candidate) =>
			!isNearLimit(scoreAccount(candidate, models), settings.thresholdPercent),
	);
	// An account that reports no windows scores a full 100 — the same "zero
	// windows is not headroom" hazard isEligible already guards for a read that
	// did not land. It wins pickBest against every account we can actually
	// read, whether it is an API-billed login (moving the user onto per-token
	// billing while the plan they pay for still has room) or a stale token
	// nobody could read. It stays a target of last resort.
	//
	// Two last resorts, in this order, as consume-first has: every unrankable
	// candidate ties at 100, so flattening them into one bucket would let the
	// alphabetical tie-break put the user on per-token billing while an
	// unrankable plan login was available.
	const best = pickBest(
		preferRanked(
			preferRanked(below, (candidate) => reportsNoWindows(candidate, models)),
			isMetered,
		),
		models,
	);
	if (!best) return stay(activeNearLimit);

	if (activeNearLimit) return move(best, "threshold");

	// Nothing we can score has room, so the only candidate left is one whose
	// usage we cannot read — and the active account is not at its limit yet, so
	// there is nothing to buy by moving.
	if (reportsNoWindows(best, models)) return stay(false);

	// R15: a proactive move has to be worth the prompt-cache rebuild it costs.
	if (scoreAccount(best, models) >= activeScore + margin) {
		return move(best, "strategy");
	}
	return stay(false);
}
