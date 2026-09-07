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
import { windowsInScope } from "./decision.ts";
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
export const NUDGE_RETRY_MS = 2_000;

/**
 * How many times the gates are re-checked, so the ceiling stays about a
 * minute. Polling rather than one late retry: the first attempt runs the
 * instant the new pty exists, before the shell has even been handed the
 * launch command, so bracketed paste cannot be on yet and that attempt is
 * always spent. A single retry then had to guess when Codex would be up.
 *
 * Bounded on purpose — a bare shell prompt raises the same paste bit as
 * Codex's TUI, so a long poll would eventually type the nudge into a pane
 * whose agent had exited.
 */
export const NUDGE_MAX_ATTEMPTS = 30;

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
	/** Live last agent event for a row; the snapshot's copy can be minutes old. */
	lastAgentEvent?(terminalId: string): { type: string; at: number } | undefined;
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
	/** Injected so a test can exhaust the poll without real time. */
	nudgeMaxAttempts?: number;
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
	private readonly nudgeMaxAttempts: number;
	/**
	 * Rows waiting for their turn to end, per agent: the terminal ids that were
	 * mid-turn when the switch reached them. Remembering the ids (rather than
	 * only the agent) is what keeps the next store change from re-scanning and
	 * restarting rows that are already on the new account; still being listed
	 * under that id is how a row that has not moved yet is recognised, because
	 * a restart ends the binding and brings the session back on a fresh
	 * terminal.
	 */
	private readonly deferred = new Map<AccountAgent, Set<string>>();

	constructor(deps: SessionMoverDeps) {
		this.deps = deps;
		this.now = deps.now ?? Date.now;
		this.setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
		this.staleStartMs = deps.staleStartMs ?? STALE_START_MS;
		this.nudgeRetryMs = deps.nudgeRetryMs ?? NUDGE_RETRY_MS;
		this.nudgeMaxAttempts = deps.nudgeMaxAttempts ?? NUDGE_MAX_ATTEMPTS;
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
		const waiting = new Set<string>();

		for (const row of rows) {
			// KTD12: a session the user pinned to their own config dir is
			// listed, never moved.
			if (!row.managed) continue;
			if (!this.isIdle(row)) {
				deferredTerminalIds.push(row.terminalId);
				waiting.add(row.terminalId);
				continue;
			}
			const resumed = await this.restart(row);
			if (resumed) movedTerminalIds.push(row.terminalId);
		}

		// `rows` is the whole set this pass considered, so what it did not defer
		// is not waiting on anything any more.
		// Only the rows this pass actually looked at are re-decided. Callers
		// hand in a pre-filtered list — and after the first switch an unpinned
		// row re-resolves to the active dir, so that list is routinely empty on
		// later passes. Replacing the whole set then forgot a session deferred
		// mid-turn by an earlier pass, and it kept running on the account the
		// engine had switched away from until the user restarted it by hand.
		const considered = new Set(rows.map((row) => row.terminalId));
		const next = new Set(
			[...(this.deferred.get(agent) ?? [])].filter(
				(terminalId) => !considered.has(terminalId),
			),
		);
		for (const terminalId of waiting) next.add(terminalId);
		if (next.size > 0) this.deferred.set(agent, next);
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
	 * row that is no longer listed under its terminal id is dropped instead of
	 * restarted: it has either been relaunched already — a restart ends the
	 * binding and resumes on a fresh terminal — or it is gone. Its `configDir`
	 * cannot say which, because every row re-resolves it from the host pointer
	 * the switch has already moved.
	 */
	async handleStoreChange(_workspaceId: string): Promise<void> {
		for (const [agent, waiting] of [...this.deferred]) {
			const rows = this.deps
				.listSessions(agent)
				.filter((row) => waiting.has(row.terminalId));
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

		await this.deliverNudge(
			row,
			resumed.terminalId,
			nudge,
			this.nudgeMaxAttempts,
		);
		return true;
	}

	/**
	 * KTD7 gate 2: does this terminal's own screen show the provider's limit
	 * text, and is the account really spent? Only the boolean leaves — the
	 * screen text is matched in memory and dropped.
	 *
	 * A snapshot is taken only where the plan allows one: the terminal a
	 * Claude hint names, or a busy Codex row while its account's window is at
	 * or over 100% in a window the proactive path scores. Everything else
	 * answers false without reading a screen.
	 *
	 * `modelWindows` are the models the user configured, per call like
	 * `windows` because the engine re-reads its settings every tick. Empty —
	 * the shipped default — means only account-wide windows count as proof.
	 */
	async corroborateLimitStop(
		row: MovableSession,
		windows: readonly UsageQuotaWindow[],
		modelWindows: readonly string[] = [],
	): Promise<boolean> {
		if (!this.maySnapshot(row, windows, modelWindows)) return false;

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

		return isCorroboratedLimitStop({
			agent: row.agent,
			hint: true,
			snapshotMatch,
			windows,
			modelWindows,
		});
	}

	private maySnapshot(
		row: MovableSession,
		windows: readonly UsageQuotaWindow[],
		modelWindows: readonly string[],
	): boolean {
		if (row.agent === "claude") {
			// Only the terminal the hook's hint named.
			return row.limitHintErrorType === CLAUDE_LIMIT_HINT;
		}
		// Codex has no hint of its own: a stall is one, so the row must be busy
		// and the account already spent before a screen is read at all. Spent is
		// scored on the same windows as gate 3, or an out-of-scope window parked
		// at 100% would read a screen every tick that gate 3 then rejects.
		if (!this.deps.isAgentBusy(row.terminalId)) return false;
		return windowsInScope(row.agent, windows, modelWindows).some(
			(window) => window.usedPercent >= 100,
		);
	}

	/**
	 * KTD9. Idle is `!isAgentBusy`, except that a *Codex* row parked on `Start`
	 * with no newer event for `staleStartMs` counts as idle too — Codex reports
	 * nothing when a turn dies in an error. Claude's hooks do report Stop, so
	 * its long `Start` is a live turn and killing it would throw the turn away.
	 * A pending permission request is always busy: killing it would discard a
	 * decision the user is about to make.
	 *
	 * Staleness is read live, like busyness: the row's own event fields are a
	 * snapshot taken before the swap and before every restart this pass has
	 * already done, so by the time a later row is judged they can be minutes
	 * behind a session that is mid-turn right now.
	 */
	private isIdle(row: MovableSession): boolean {
		if (!this.deps.isAgentBusy(row.terminalId)) return true;
		if (row.agent !== "codex") return false;
		const live = this.deps.lastAgentEvent?.(row.terminalId);
		const type = live?.type ?? row.lastEventType;
		const at = live?.at ?? row.lastEventAt;
		if (type !== "Start") return false;
		return this.now() - at >= this.staleStartMs;
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
	 * Type the nudge into a resumed Codex session, once every gate holds. The
	 * gates are re-checked every `nudgeRetryMs` until they do or the attempts
	 * run out, after which the session needs a human.
	 *
	 * Polled rather than tried twice: the first attempt runs the instant the
	 * new pty exists, and at that point the shell has not yet been handed
	 * `codex resume` — the launch command waits on the shell-ready marker —
	 * so bracketed paste is necessarily off and that attempt is always spent.
	 * With one retry left, delivery then depended on Codex being up at exactly
	 * that moment, and a slow boot dropped the nudge for good.
	 */
	private async deliverNudge(
		row: MovableSession,
		terminalId: string,
		nudge: string,
		attemptsLeft: number,
	): Promise<void> {
		if (await this.tryNudge(row, terminalId, nudge)) return;

		if (attemptsLeft <= 0) {
			this.deps.onNeedsAttention({
				agent: row.agent,
				workspaceId: row.workspaceId,
				terminalId,
				reason: "nudge-undeliverable",
			});
			return;
		}

		this.setTimeoutFn(() => {
			void this.deliverNudge(row, terminalId, nudge, attemptsLeft - 1);
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
