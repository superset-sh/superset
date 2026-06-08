import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

/**
 * A human-recognizable descriptor for one active agent session, derived from
 * the full set of live sessions so same-agent sessions can be told apart.
 *
 * The picker previously rendered each option as `agentId · terminalId[0:6]`.
 * `agentId` alone is generic — multiple `claude`/`codex` sessions collide —
 * and the 6-hex fragment is opaque (it maps to nothing the user sees). When
 * several sessions share an agent we attach a stable, human-countable ordinal
 * ("claude #1", "claude #2") so the target is at least distinguishable.
 */
export interface SessionLabel {
	terminalId: string;
	agentId: string;
	/**
	 * 1-based position among sessions that share this `agentId`, following the
	 * input order (the composer passes sessions sorted most-recent-first, so
	 * `#1` is the most recently active). `null` when this agent has only one
	 * live session — there is nothing to disambiguate.
	 */
	ordinal: number | null;
	/** How many live sessions share this `agentId`. */
	sameAgentCount: number;
	/** Short, stable fragment of the terminalId, kept as a secondary hint. */
	shortId: string;
}

const SHORT_ID_LENGTH = 6;

/**
 * Builds a {@link SessionLabel} per session keyed by `terminalId`. Pure: the
 * same input always yields the same labels, so the picker and trigger render
 * identically and the result is trivially testable.
 */
export function buildSessionLabels(
	sessions: TerminalAgentBinding[],
): Map<string, SessionLabel> {
	const countByAgent = new Map<string, number>();
	for (const session of sessions) {
		countByAgent.set(
			session.agentId,
			(countByAgent.get(session.agentId) ?? 0) + 1,
		);
	}

	const seenByAgent = new Map<string, number>();
	const labels = new Map<string, SessionLabel>();
	for (const session of sessions) {
		const sameAgentCount = countByAgent.get(session.agentId) ?? 1;
		const position = (seenByAgent.get(session.agentId) ?? 0) + 1;
		seenByAgent.set(session.agentId, position);
		labels.set(session.terminalId, {
			terminalId: session.terminalId,
			agentId: session.agentId,
			ordinal: sameAgentCount > 1 ? position : null,
			sameAgentCount,
			shortId: session.terminalId.slice(0, SHORT_ID_LENGTH),
		});
	}
	return labels;
}

/**
 * The headline name for a session: the agent name, suffixed with its ordinal
 * only when same-agent sessions exist. Used for both the dropdown option and
 * the closed trigger so the user reads the same identifier in both places.
 */
export function formatSessionName(label: SessionLabel): string {
	return label.ordinal != null
		? `${label.agentId} #${label.ordinal}`
		: label.agentId;
}
