import type {
	QuotaCapableAgent,
	UsageQuotaWindow,
} from "../trpc/router/usage/types";

/**
 * Turning a limit-stop *hint* into an action, as three pure gates (KTD7).
 *
 * A hint is cheap to forge: the hook endpoint is unauthenticated and a
 * terminal id is readable from any same-user process environment. So a hint
 * only ever says which terminal to look at. What acts on it is evidence the
 * host read itself — the terminal's own screen and the account's own quota —
 * behind a cooldown and an hourly ceiling so a hint storm cannot turn into a
 * switch storm or a fetch storm.
 *
 * The gates are ordered cheapest-first on purpose: `fallbackAllowed` costs
 * nothing and runs before any snapshot or quota read, so a rejected hint
 * never reaches the provider. The windows handed to `isCorroboratedLimitStop`
 * come from the quota store, which owns the 30-second floor and the 429
 * back-off (KTD10) — these predicates never fetch.
 */

/** Fallback switches allowed per agent per hour (KTD7 gate 1). */
export const FALLBACK_CEILING_PER_HOUR = 4;

const HOUR_MS = 3_600_000;

export interface FallbackAllowedInput {
	/** Epoch ms until which the engine's cooldown blocks any switch. Null is
	 * "no cooldown", the shape the runtime state stores it in. */
	cooldownUntil?: number | null;
	/** Epoch ms of this agent's previous fallback switches. */
	fallbackTimestamps: readonly number[];
	now: number;
	ceilingPerHour?: number;
}

/**
 * Gate 1: the local rate limits. False means the hint is rejected before any
 * snapshot or quota read — record it as `fallback-rejected` and stop.
 */
export function fallbackAllowed({
	cooldownUntil,
	fallbackTimestamps,
	now,
	ceilingPerHour = FALLBACK_CEILING_PER_HOUR,
}: FallbackAllowedInput): boolean {
	if (typeof cooldownUntil === "number" && now < cooldownUntil) return false;
	const withinHour = fallbackTimestamps.filter((at) => now - at < HOUR_MS);
	return withinHour.length < ceilingPerHour;
}

// Both CLIs print the limit on one line ("You've hit your session limit ·
// resets 3:45pm"). Matching within a line keeps a wrapped screen or two
// unrelated lines from corroborating each other. The apostrophe is matched
// straight or typographic because terminals render both.
const LIMIT_TEXT: Partial<Record<QuotaCapableAgent, RegExp>> = {
	claude: /You['’]ve hit your[^\n]*limit/i,
	codex: /You['’]ve hit your usage limit/i,
};

/**
 * The last `rows` lines of a terminal snapshot: what is on screen *now*.
 *
 * The host's snapshot carries recent scrollback as well as the visible screen
 * (a plain shell keeps up to a thousand lines of it), and an hours-old limit
 * message sitting in that scrollback would corroborate a brand-new hint. Gate
 * 2 is meant to be evidence that this turn stopped, so it only ever sees the
 * screen. Matched in memory like every other snapshot text, never persisted.
 */
export function lastVisibleScreen(screenText: string, rows: number): string {
	if (!Number.isFinite(rows) || rows <= 0) return screenText;
	const lines = screenText.split("\n");
	return lines.length <= rows ? screenText : lines.slice(-rows).join("\n");
}

/**
 * Gate 2: the host-observed corroborator. `screenText` is a live terminal
 * snapshot — matched in memory, never persisted, broadcast or logged.
 */
export function snapshotShowsLimit(
	agent: QuotaCapableAgent,
	screenText: string,
): boolean {
	return LIMIT_TEXT[agent]?.test(screenText) ?? false;
}

export interface CorroboratedLimitStopInput {
	/** The hint: a `Failed` event carrying `rate_limit`, or a Codex stall. */
	hint: boolean;
	/** What `snapshotShowsLimit` said about that terminal's screen. */
	snapshotMatch: boolean;
	/** The account's windows as the quota store last read them. */
	windows: readonly UsageQuotaWindow[];
}

/**
 * Gate 3, and the verdict. Every part must hold: the hint points at the
 * terminal, the host saw the limit text there, and the account really is
 * spent. An uncorroborated hint is not a limit stop.
 */
export function isCorroboratedLimitStop({
	hint,
	snapshotMatch,
	windows,
}: CorroboratedLimitStopInput): boolean {
	if (!hint || !snapshotMatch) return false;
	return windows.some((window) => window.usedPercent >= 100);
}
