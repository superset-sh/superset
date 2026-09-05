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
 * The longest-period window per agent — Claude's weekly, Codex's secondary
 * (R12). `consume-first` orders accounts by when this one resets, so it is
 * matched by prefix: `seven_day_sonnet` still belongs to the weekly period
 * when a plan reports no plain `seven_day`.
 */
const LONGEST_PERIOD_WINDOW_PREFIX: Record<AccountAgent, string> = {
	claude: "seven_day",
	codex: "secondary",
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

/** The windows this account is scored on: account-wide plus configured. */
export function relevantWindows(
	account: DecisionAccount,
	modelWindows: readonly string[],
): UsageQuotaWindow[] {
	const accountWide = ACCOUNT_WIDE_WINDOW_IDS[account.agent];
	return account.windows.filter(
		(window) =>
			accountWide.includes(window.id) || matchesModel(window, modelWindows),
	);
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
 * R16/R23. In rotation and signed in. The rotation file wins over the flag
 * the account carries, because that file is what the user's toggle writes.
 * `accountRotationKey` is the spelling both the renderer and the router use,
 * so it is looked up first; the bare `accountId` and `accountKey` follow it
 * as legacy spellings a toggle may still be filed under.
 */
export function isEligible(
	account: DecisionAccount,
	rotation: RotationState,
	tokenState: QuotaTokenState = account.tokenState,
): boolean {
	if (tokenState === "token_expired" || tokenState === "signed_out") {
		return false;
	}
	return rotationFlag(account, rotation);
}

function rotationFlag(
	account: DecisionAccount,
	rotation: RotationState,
): boolean {
	const key = accountRotationKey(account);
	if (key in rotation) return rotation[key] === true;
	if (account.accountId !== null && account.accountId in rotation) {
		return rotation[account.accountId] === true;
	}
	if (account.accountKey in rotation)
		return rotation[account.accountKey] === true;
	return account.inRotation;
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

function longestPeriodResetAt(account: DecisionAccount): number | null {
	const prefix = LONGEST_PERIOD_WINDOW_PREFIX[account.agent];
	let soonest: number | null = null;
	for (const window of account.windows) {
		if (!window.id.startsWith(prefix) || window.resetsAt === null) continue;
		const at = window.resetsAt.getTime();
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
): DecisionAccount | null {
	let best: DecisionAccount | null = null;
	let bestAt = Number.POSITIVE_INFINITY;
	for (const account of accounts) {
		const at = longestPeriodResetAt(account) ?? Number.POSITIVE_INFINITY;
		if (
			at < bestAt ||
			(at === bestAt && best !== null && account.accountKey < best.accountKey)
		) {
			best = account;
			bestAt = at;
		}
	}
	return best;
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
		// R12/KTD11: the floor is the margin — an account with less headroom
		// than that has nothing left to drain.
		const withRoom = eligible.filter(
			(candidate) => scoreAccount(candidate, models) >= margin,
		);
		const target = pickConsumeFirst(withRoom);
		if (target) return move(target, activeNearLimit ? "threshold" : "strategy");
		return stay(activeNearLimit);
	}

	// `best`: only ever land on an account that is not itself near its limit,
	// so a switch buys real headroom rather than moving the stop by a minute.
	const below = eligible.filter(
		(candidate) =>
			!isNearLimit(scoreAccount(candidate, models), settings.thresholdPercent),
	);
	const best = pickBest(below, models);
	if (!best) return stay(activeNearLimit);

	if (activeNearLimit) return move(best, "threshold");

	// R15: a proactive move has to be worth the prompt-cache rebuild it costs.
	if (scoreAccount(best, models) >= activeScore + margin) {
		return move(best, "strategy");
	}
	return stay(false);
}
