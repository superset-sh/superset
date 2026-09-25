import type { HostDb } from "../db";
import {
	getTerminalAgentBindingSessionId,
	markTerminalAgentBindingEnded,
} from "./persistence.ts";

const DAEMON_LOSS_SWEEP_ATTEMPTS = 5;
const DAEMON_LOSS_SWEEP_DELAY_MS = 2_000;

export interface DaemonLossSweepCandidate {
	terminalId: string;
	db: HostDb;
}

/**
 * A daemon-client disconnect does not always mean the ptys died: an upgrade
 * hands sessions to a successor daemon, and a socket blip leaves the same
 * daemon owning them for re-adoption. Marking bindings ended on those would
 * hide live agents from reads and offer resume for running sessions.
 *
 * So the sweep verifies first: wait for a daemon to answer and mark only the
 * bindings whose session it no longer owns. If no daemon answers after the
 * retries, the old daemon — and the ptys parented to it — is gone, so mark
 * them all. Total wait stays well inside the death-gasp upgrade window.
 */
export async function sweepAgentBindingsAfterDaemonLoss(args: {
	candidates: DaemonLossSweepCandidate[];
	/** Ids of sessions a live daemon still owns; null = no daemon reachable. */
	listAliveSessionIds: () => Promise<Set<string> | null>;
	attempts?: number;
	delayMs?: number;
}): Promise<void> {
	if (args.candidates.length === 0) return;
	const attempts = args.attempts ?? DAEMON_LOSS_SWEEP_ATTEMPTS;
	const delayMs = args.delayMs ?? DAEMON_LOSS_SWEEP_DELAY_MS;

	// Capture which agent session each binding pointed at when the daemon was
	// lost. A terminal respawned mid-sweep can start a NEW session; its fresh
	// binding must not be marked ended by this delayed pass. Only a concrete
	// session id makes a usable baseline — a binding without one is never a
	// resume candidate, so there is nothing to gain by marking it.
	const expectedSessionIds = new Map<string, string>();
	for (const candidate of args.candidates) {
		try {
			const sessionId = getTerminalAgentBindingSessionId(
				candidate.db,
				candidate.terminalId,
			);
			if (sessionId !== undefined) {
				expectedSessionIds.set(candidate.terminalId, sessionId);
			}
		} catch (error) {
			console.warn(
				`[terminal-agents] failed to snapshot binding for ${candidate.terminalId}; leaving it untouched`,
				error,
			);
		}
	}

	let alive: Set<string> | null = null;
	let lastProbeError: unknown;
	for (let attempt = 0; attempt < attempts; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		try {
			alive = await args.listAliveSessionIds();
		} catch (error) {
			lastProbeError = error;
			alive = null;
		}
		if (alive !== null) break;
	}
	if (alive === null) {
		console.warn(
			`[terminal-agents] no daemon answered after ${attempts} probes; marking ${args.candidates.length} agent binding(s) ended`,
			lastProbeError,
		);
	}

	for (const candidate of args.candidates) {
		if (alive?.has(candidate.terminalId)) continue;
		const expected = expectedSessionIds.get(candidate.terminalId);
		if (expected === undefined) continue;
		try {
			const current = getTerminalAgentBindingSessionId(
				candidate.db,
				candidate.terminalId,
			);
			if (current !== expected) continue;
			markTerminalAgentBindingEnded(
				candidate.db,
				candidate.terminalId,
				"terminal-exited",
			);
		} catch (error) {
			console.warn(
				`[terminal-agents] failed to mark agent binding ended for ${candidate.terminalId}`,
				error,
			);
		}
	}
}
