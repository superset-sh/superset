/**
 * The seam between the account engine and the rest of the host-service.
 *
 * The engine and the session mover take closures, never modules (KTD1): they
 * must run on a headless host, in tests, and on a lock-loser service without
 * dragging a router graph behind them. This file is the one place allowed to
 * know both sides — it turns what `app.ts` already holds (the db, the
 * terminal-agent store, the event bus, and a fabricated `HostServiceContext`
 * of the kind `launchSandboxAgent` builds) into that closure set, so `app.ts`
 * stays a wiring file and the engine stays importable on its own.
 */

import type { HostDb } from "../db/index.ts";
import { agentIsBusy } from "../page-watch/index.ts";
import {
	disposeSessionAndWait,
	isLiveTerminalSession,
	snapshotSession,
	writeFramedInputToSession,
} from "../terminal/terminal.ts";
import type { TerminalAgentStore } from "../terminal-agents/index.ts";
import { runAgentInWorkspace } from "../trpc/router/agents/agents.ts";
import {
	bindingHasHarnessSession,
	killAndResumeTerminalAgent,
	listAccountRestartCandidates,
	type ResumeSessionDeps,
} from "../trpc/router/terminal-agents/terminal-agents.ts";
import type { HostServiceContext } from "../types.ts";
import { lastVisibleScreen } from "./limit-stop.ts";
import type {
	MovableSession,
	ResumedTerminal,
	SessionMover,
} from "./session-mover.ts";
import type { AccountAgent } from "./types.ts";

export interface HostDepsInput {
	db: HostDb;
	terminalAgentStore: TerminalAgentStore;
	/**
	 * A context for the agent launch, fabricated the way `launchSandboxAgent`
	 * does it in `app.ts`. Called per launch so nothing here holds one open.
	 */
	makeContext: () => HostServiceContext;
	/**
	 * Whether the program in this terminal has bracketed paste on — the KTD8
	 * gate that tells a live agent TUI apart from the shell prompt left
	 * behind when the agent died. Supplied by `app.ts` because the flag lives
	 * on the per-session mode tracker inside `terminal/terminal.ts`.
	 */
	isBracketedPasteActive: (terminalId: string) => boolean;
}

/** The closures the engine (KTD1) and the session mover (KTD8) both take. */
export interface AccountEngineHostDeps {
	listSessions(agent: AccountAgent): MovableSession[];
	isAgentBusy(terminalId: string): boolean;
	isTerminalAlive(terminalId: string): boolean;
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
	snapshotTerminal(terminalId: string): Promise<string | null>;
	hasStartedAgent(terminalId: string, agent: AccountAgent): boolean;
	isBracketedPasteActive(terminalId: string): boolean;
}

function resumeDeps(input: HostDepsInput): ResumeSessionDeps {
	return {
		db: input.db,
		terminalAgentStore: input.terminalAgentStore,
		runAgent: (runInput) => runAgentInWorkspace(input.makeContext(), runInput),
		disposeSession: (terminalId) => disposeSessionAndWait(terminalId, input.db),
		hasSession: (binding) => bindingHasHarnessSession(input.db, binding),
	};
}

export function createAccountEngineHostDeps(
	input: HostDepsInput,
): AccountEngineHostDeps {
	const { db, terminalAgentStore } = input;

	return {
		// Pre-classified here rather than in the mover: `managed` is a
		// launch-env question and belongs beside `default-account.ts` (KTD12).
		listSessions: (agent) =>
			listAccountRestartCandidates(db, terminalAgentStore, agent).map(
				({ binding, configDir, managed }) => ({
					workspaceId: binding.workspaceId,
					terminalId: binding.terminalId,
					agent,
					managed,
					configDir,
					lastEventType: binding.lastEventType,
					lastEventAt: binding.lastEventAt,
					...(binding.lastTransitionAt === undefined
						? {}
						: { lastTransitionAt: binding.lastTransitionAt }),
					...(binding.lastFailure === undefined
						? {}
						: { limitHintErrorType: binding.lastFailure.errorType }),
				}),
			),

		isAgentBusy: (terminalId) =>
			agentIsBusy(terminalAgentStore.get(terminalId)?.lastEventType),

		isTerminalAlive: isLiveTerminalSession,

		killAndResume: async ({ workspaceId, terminalId, prompt }) => {
			// The nudge is registered before anything is killed, so the resume
			// that follows carries it even if the renderer's auto-resume wins
			// the race (KTD8).
			const result = await killAndResumeTerminalAgent(resumeDeps(input), {
				workspaceId,
				terminalId,
				...(prompt === undefined ? {} : { prompt }),
			});
			return result.resumed ? { terminalId: result.terminalId } : null;
		},

		sendToTerminal: async ({ workspaceId, terminalId, text }) => {
			const result = await writeFramedInputToSession({
				terminalId,
				workspaceId,
				text,
				submit: true,
				db,
			});
			if ("error" in result) throw new Error(result.error);
		},

		// Read in memory and handed straight to the matcher; the engine keeps
		// only the boolean (KTD7). Trimmed to the visible screen: the snapshot
		// carries recent scrollback too, and an old limit message left up there
		// must not corroborate a new hint.
		snapshotTerminal: async (terminalId) => {
			const workspaceId = terminalAgentStore.get(terminalId)?.workspaceId;
			if (!workspaceId) return null;
			const result = await snapshotSession({ terminalId, workspaceId, db });
			if ("error" in result) return null;
			return lastVisibleScreen(result.text, result.rows);
		},

		hasStartedAgent: (terminalId, agent) => {
			const binding = terminalAgentStore.get(terminalId);
			return (
				binding !== undefined &&
				binding.endedAt === undefined &&
				binding.agentId === agent
			);
		},

		isBracketedPasteActive: input.isBracketedPasteActive,
	};
}

/**
 * Retry the sessions that were mid-turn whenever the store changes: such a row
 * moves at its next `Stop` (R7), and the store's per-workspace `change` event
 * is the only notice of that.
 */
export function subscribeSessionMoverToStore(
	store: TerminalAgentStore,
	mover: SessionMover,
): () => void {
	const onChange = (workspaceId: string) => {
		// Detached on purpose — the store's emit must not wait on a restart —
		// but never unhandled: a rejection here is the reason a session stayed
		// on the old account, so it is reported rather than swallowed.
		mover.handleStoreChange(workspaceId).catch((error: unknown) => {
			console.warn(
				"[account-engine] moving sessions after a store change failed",
				{
					workspaceId,
					error,
				},
			);
		});
	};
	store.on("change", onChange);
	return () => {
		store.off("change", onChange);
	};
}
