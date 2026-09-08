import type { SubagentTranscriptEntry } from "../subagent-transcript";

/**
 * What a hook event inside a subagent tells us about where its transcript
 * lives. `transcriptPath` is the file the hook ran against and
 * `agentTranscriptPath` names the child directly when the harness sends it.
 */
export interface SubagentTranscriptHint {
	subagentId: string;
	/** The session id the child's hook reported, if any. */
	sessionId?: string;
	transcriptPath?: string;
	agentTranscriptPath?: string;
}

export interface ParsedSubagentTranscript {
	entries: SubagentTranscriptEntry[];
	/** Harness-provided title for the child, when the transcript carries one. */
	description?: string;
}

/**
 * The harness-specific half of subagent support: how a harness's child
 * events map onto the roster and where its transcripts live. Everything
 * else — the hook wire format keyed on `agent_id`, the roster, the sidebar,
 * the pane — is agent-agnostic and never names a harness.
 *
 * Build one with {@link defineSubagentHarness}, which fills every member
 * with the shared default, and register it in `SUBAGENT_HARNESSES`.
 */
export interface SubagentHarness {
	/** Whether a hook event name means the child finished its turn. */
	isStopEvent(eventType: string): boolean;
	/**
	 * Whether a child event belongs to the parent binding's current session.
	 * Only harnesses whose child hooks carry the parent's session id can
	 * tell; the default accepts.
	 */
	belongsToParentSession(
		hint: SubagentTranscriptHint,
		parentSessionId: string,
	): boolean;
	/** The child's transcript file from what its hook events carry. */
	resolveTranscriptPath(hint: SubagentTranscriptHint): string | undefined;
	parseTranscript(text: string): ParsedSubagentTranscript;
	/** A title kept beside the transcript rather than inside it, if any. */
	readDescription(transcriptPath: string): string | undefined;
}

/** Hook event names that end a child's turn in the Claude schema and its forks. */
const DEFAULT_STOP_EVENTS = new Set(["SubagentStop", "Stop", "SessionEnd"]);

const defaults: Omit<SubagentHarness, "parseTranscript"> = {
	isStopEvent: (eventType) => DEFAULT_STOP_EVENTS.has(eventType),
	belongsToParentSession: () => true,
	resolveTranscriptPath: (hint) =>
		hint.agentTranscriptPath || hint.transcriptPath || undefined,
	readDescription: () => undefined,
};

/**
 * A harness with every member present: the parser is the one thing a
 * harness must bring, the rest defaults to the shared behavior.
 */
export function defineSubagentHarness(
	harness: Partial<SubagentHarness> & Pick<SubagentHarness, "parseTranscript">,
): SubagentHarness {
	return { ...defaults, ...harness };
}
