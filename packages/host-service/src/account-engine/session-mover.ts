/**
 * Moving running agent sessions onto the account the engine chose (KTD8,
 * KTD9, KTD12).
 *
 * Two ways in. `moveAtIdle` is the planned one: after a switch, every managed
 * session of that agent is restarted with resume the moment it is between
 * turns, so the user sees the same conversation on a fresh account and types
 * nothing. `fallbackRestart` is the unplanned one: a session that hit the
 * limit anyway is restarted and told to continue, because auto-resume relaunches
 * with an empty prompt and an interrupted turn would otherwise just sit there.
 *
 * Everything the mover touches arrives as a closure (KTD1): it never imports a
 * router, never reads the database, and never swaps a login — a lock-loser
 * host-service runs the same code on its own terminals (KTD5).
 */

import type { UsageQuotaWindow } from "../trpc/router/usage/types.ts";
import { isCorroboratedLimitStop, snapshotShowsLimit } from "./limit-stop.ts";
import type { AccountAgent } from "./types.ts";

/**
 * The only thing ever typed into a resumed session. A module constant on
 * purpose: hook payloads and terminal screens are attacker-reachable, so no
 * part of this text is ever interpolated (KTD8).
 */
export const CONTINUE_NUDGE =
	"Continue where you left off. The account was switched; the previous turn was interrupted.";

/**
 * KTD9: Codex fires no hook when a turn ends in an error, so a Codex row still
 * reading "Start" this long after its last event is treated as idle rather
 * than left running on the old account forever. Codex only: Claude's hooks
 * report Stop reliably, so a Claude row parked on Start is a long turn.
 */
export const STALE_START_MS = 15 * 60_000;

/** KTD8: the single retry for a Codex nudge that could not be delivered. */
export const NUDGE_RETRY_MS = 30_000;

/** How much of an unmatched snapshot the debug flag may reveal (KTD7). */
const DEBUG_EXCERPT_CHARS = 200;

/** A live agent session as `listSessions` pre-classifies it (KTD12). */
export interface MovableSession {
	workspaceId: string;
	terminalId: string;
	agent: AccountAgent;
	/** False for a user-pinned config dir — never restarted. */
	managed: boolean;
	/** Account dir the launch resolves to; null is the CLI's own home. */
	configDir: string | null;
	lastEventType: string;
	lastEventAt: number;
	/** When the row last moved busy → stopped, if it ever has. */
	lastTransitionAt?: number;
	/** `errorType` of the last `Failed` event — the Claude limit-stop hint. */
	limitHintErrorType?: string;
}

export type NeedsAttentionReason = "resume-failed" | "nudge-undeliverable";

/** R8's give-up signal: the session needs a human, not another retry. */
export interface NeedsAttentionEvent {
	agent: AccountAgent;
	workspaceId: string;
	terminalId: string;
	reason: NeedsAttentionReason;
}

export interface ResumedTerminal {
	terminalId: string;
}

export interface SessionMoverDeps {
	/** Live rows for one agent, pre-classified by `resolveAgentAccountDir`. */
	listSessions(agent: AccountAgent): MovableSession[];
	isAgentBusy(terminalId: string): boolean;
	isTerminalAlive(terminalId: string): boolean;
	/**
	 * Kill crash-style and resume in a fresh terminal, launching with `prompt`
	 * when one is given. Null means nothing came back.
	 */
	killAndResume(input: {
		workspaceId: string;
		terminalId: string;
		prompt?: string;
	}): Promise<ResumedTerminal | null>;
	sendToTerminal(input: {
		workspaceId: string;
		terminalId: string;
		text: string;
	}): Promise<void>;
	/** The terminal's current screen, matched in memory and then dropped. */
	snapshotTerminal(terminalId: string): Promise<string | null>;
	/** Gate: the resumed terminal reported SessionStart for this agent. */
	hasStartedAgent(terminalId: string, agent: AccountAgent): boolean;
	/** Gate: a TUI has bracketed paste on — a bare shell prompt does not. */
	isBracketedPasteActive(terminalId: string): boolean;
	onNeedsAttention(event: NeedsAttentionEvent): void;
	now?: () => number;
	setTimeoutFn?: typeof setTimeout;
	staleStartMs?: number;
	nudgeRetryMs?: number;
}

export interface MoveResult {
	/** Terminals whose restart was launched. */
	movedTerminalIds: string[];
	/** Terminals still mid-turn; retried on the store's next change. */
	deferredTerminalIds: string[];
}

const CLAUDE_LIMIT_HINT = "rate_limit";

export class SessionMover {
	private readonly deps: SessionMoverDeps;
	private readonly now: () => number;
	private readonly setTimeoutFn: typeof setTimeout;
	private readonly staleStartMs: number;
	private readonly nudgeRetryMs: number;
	/**
	 * Rows waiting for their turn to end, per agent: terminal id → the account
	 * dir the row was on when it was deferred. Remembering the ids (rather than
	 * only the agent) is what keeps the next store change from re-scanning and
	 * restarting rows that are already on the new account; remembering the dir
	 * is how a row that has since moved off it is recognised.
	 */
	private readonly deferred = new Map<
		AccountAgent,
		Map<string, string | null>
	>();

	constructor(deps: SessionMoverDeps) {
		this.deps = deps;
		this.now = deps.now ?? Date.now;
		this.setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
		this.staleStartMs = deps.staleStartMs ?? STALE_START_MS;
		this.nudgeRetryMs = deps.nudgeRetryMs ?? NUDGE_RETRY_MS;
	}

	/**
	 * Restart every managed row that is between turns (R7). Rows still working
	 * are remembered and picked up by {@link handleStoreChange} when their
	 * turn ends, so a mid-turn session is never killed under the user.
	 */
	async moveAtIdle(
		agent: AccountAgent,
		rows: MovableSession[] = this.deps.listSessions(agent),
	): Promise<MoveResult> {
		const movedTerminalIds: string[] = [];
		const deferredTerminalIds: string[] = [];
		const waiting = new Map<string, string | null>();

		for (const row of rows) {
			// KTD12: a session the user pinned to their own config dir is
			// listed, never moved.
			if (!row.managed) continue;
			if (!this.isIdle(row)) {
				deferredTerminalIds.push(row.terminalId);
				waiting.set(row.terminalId, row.configDir);
				continue;
			}
			const resumed = await this.restart(row);
			if (resumed) movedTerminalIds.push(row.terminalId);
		}

		// `rows` is the whole set this pass considered, so what it did not defer
		// is not waiting on anything any more.
		if (waiting.size > 0) this.deferred.set(agent, waiting);
		else this.deferred.delete(agent);

		return { movedTerminalIds, deferredTerminalIds };
	}

	/**
	 * KTD5: what a lock loser runs when the owner broadcasts a switch. Same
	 * move, this service's own terminals, and no swap primitive in sight.
	 */
	async onExternalSwitch(agent: AccountAgent): Promise<MoveResult> {
		return this.moveAtIdle(agent);
	}

	/**
	 * Retry the rows that were mid-turn when the store changes — only those.
	 * A full re-scan here would restart every idle managed row again, including
	 * the sessions this switch already moved onto the new account. A remembered
	 * row that has vanished, or whose account dir has changed since (it is on
	 * the new account already), is dropped instead of restarted.
	 */
	async handleStoreChange(_workspaceId: string): Promise<void> {
		for (const [agent, waiting] of [...this.deferred]) {
			const rows = this.deps
				.listSessions(agent)
				.filter(
					(row) =>
						waiting.has(row.terminalId) &&
						waiting.get(row.terminalId) === row.configDir,
				);
			if (rows.length === 0) {
				this.deferred.delete(agent);
				continue;
			}
			await this.moveAtIdle(agent, rows);
		}
	}

	/**
	 * R8: bring a limit-stopped session back and tell it to continue. Claude
	 * takes the nudge as its launch prompt; Codex is typed to, because its
	 * resume takes no prompt — and only once the three KTD8 gates hold.
	 */
	async fallbackRestart(
		row: MovableSession,
		nudge: string = CONTINUE_NUDGE,
	): Promise<boolean> {
		const resumed = await this.restart(row, nudge);
		if (!resumed) return false;
		if (row.agent === "claude") return true;

		await this.deliverNudge(row, resumed.terminalId, nudge, true);
		return true;
	}

	/**
	 * KTD7 gate 2: does this terminal's own screen show the provider's limit
	 * text, and is the account really spent? Only the boolean leaves — the
	 * screen text is matched in memory and dropped.
	 *
	 * A snapshot is taken only where the plan allows one: the terminal a
	 * Claude hint names, or a busy Codex row while its account's window is at
	 * or over 100%. Everything else answers false without reading a screen.
	 */
	async corroborateLimitStop(
		row: MovableSession,
		windows: readonly UsageQuotaWindow[],
	): Promise<boolean> {
		if (!this.maySnapshot(row, windows)) return false;

		const screenText = await this.deps.snapshotTerminal(row.terminalId);
		const snapshotMatch =
			screenText !== null && snapshotShowsLimit(row.agent, screenText);
		if (
			!snapshotMatch &&
			screenText !== null &&
			process.env.SUPERSET_DEBUG_HOOKS
		) {
			console.debug("[account-engine] limit text not found in snapshot", {
				terminalId: row.terminalId,
				excerpt: screenText.slice(0, DEBUG_EXCERPT_CHARS),
			});
		}

		return isCorroboratedLimitStop({ hint: true, snapshotMatch, windows });
	}

	private maySnapshot(
		row: MovableSession,
		windows: readonly UsageQuotaWindow[],
	): boolean {
		if (row.agent === "claude") {
			// Only the terminal the hook's hint named.
			return row.limitHintErrorType === CLAUDE_LIMIT_HINT;
		}
		// Codex has no hint of its own: a stall is one, so the row must be busy
		// and the account already spent before a screen is read at all.
		if (!this.deps.isAgentBusy(row.terminalId)) return false;
		return windows.some((window) => window.usedPercent >= 100);
	}

	/**
	 * KTD9. Idle is `!isAgentBusy`, except that a *Codex* row parked on `Start`
	 * with no newer event for `staleStartMs` counts as idle too — Codex reports
	 * nothing when a turn dies in an error. Claude's hooks do report Stop, so
	 * its long `Start` is a live turn and killing it would throw the turn away.
	 * A pending permission request is always busy: killing it would discard a
	 * decision the user is about to make.
	 */
	private isIdle(row: MovableSession): boolean {
		if (!this.deps.isAgentBusy(row.terminalId)) return true;
		if (row.agent !== "codex") return false;
		if (row.lastEventType !== "Start") return false;
		return this.now() - row.lastEventAt >= this.staleStartMs;
	}

	private async restart(
		row: MovableSession,
		nudge?: string,
	): Promise<ResumedTerminal | null> {
		// Claude takes the nudge as its launch prompt; Codex resumes bare and
		// is typed to afterwards.
		const prompt =
			nudge !== undefined && row.agent === "claude" ? nudge : undefined;
		let resumed: ResumedTerminal | null = null;
		try {
			resumed = await this.deps.killAndResume({
				workspaceId: row.workspaceId,
				terminalId: row.terminalId,
				...(prompt === undefined ? {} : { prompt }),
			});
		} catch (error) {
			console.warn("[account-engine] failed to restart session", {
				terminalId: row.terminalId,
				error,
			});
		}
		if (resumed) return resumed;

		this.deps.onNeedsAttention({
			agent: row.agent,
			workspaceId: row.workspaceId,
			terminalId: row.terminalId,
			reason: "resume-failed",
		});
		return null;
	}

	/**
	 * Type the nudge into a resumed Codex session, once every gate holds. A
	 * gate that does not hold (or a write that fails) buys one retry
	 * `nudgeRetryMs` later with the gates re-checked; after that the session
	 * needs a human.
	 */
	private async deliverNudge(
		row: MovableSession,
		terminalId: string,
		nudge: string,
		mayRetry: boolean,
	): Promise<void> {
		if (await this.tryNudge(row, terminalId, nudge)) return;

		if (!mayRetry) {
			this.deps.onNeedsAttention({
				agent: row.agent,
				workspaceId: row.workspaceId,
				terminalId,
				reason: "nudge-undeliverable",
			});
			return;
		}

		this.setTimeoutFn(() => {
			void this.deliverNudge(row, terminalId, nudge, false);
		}, this.nudgeRetryMs);
	}

	private async tryNudge(
		row: MovableSession,
		terminalId: string,
		nudge: string,
	): Promise<boolean> {
		if (!this.deps.hasStartedAgent(terminalId, row.agent)) return false;
		if (!this.deps.isBracketedPasteActive(terminalId)) return false;
		if (!this.deps.isTerminalAlive(terminalId)) return false;
		try {
			await this.deps.sendToTerminal({
				workspaceId: row.workspaceId,
				terminalId,
				text: nudge,
			});
			return true;
		} catch (error) {
			console.warn("[account-engine] failed to type the continue nudge", {
				terminalId,
				error,
			});
			return false;
		}
	}
}
