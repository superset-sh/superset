/**
 * The provider-neutral half of a terminal agent's identity.
 *
 * A Superset terminal id names a PTY. It is not the id any provider CLI
 * accepts for `--resume`, and an open PTY is not evidence that an agent is
 * still running inside it. This module owns the one derivation that turns a
 * terminal agent binding into the identity and liveness an external
 * orchestrator can act on, so the CLI, the host service, and the desktop
 * renderer all answer "is this agent working?" the same way.
 *
 * Timestamps are ISO 8601 here — this contract is read by tooling outside
 * the app, where an epoch millisecond number carries no timezone or units.
 * The binding rows themselves keep their epoch-millisecond columns.
 */

/**
 * What the agent conversation is doing, independent of which provider runs
 * it and independent of whether its terminal is still open.
 *
 * - `starting`: launched, but no lifecycle event has landed yet. The
 *   provider session id is not knowable at this point.
 * - `working`: mid-turn.
 * - `awaiting-input`: blocked on a permission/tool decision.
 * - `idle`: attached or finished a turn, still alive.
 * - `failed`: the agent reported its turn ended in failure.
 * - `ended`: the agent session is over — whether it said goodbye or its
 *   terminal died under it. An `ended` agent whose PTY is still open is the
 *   case that must never read as `working`.
 */
export type AgentSessionState =
	| "starting"
	| "working"
	| "awaiting-input"
	| "idle"
	| "failed"
	| "ended";

export interface AgentSessionStateInput {
	/** The binding's last lifecycle event; absent until the first hook lands. */
	lastEventType?: string | null;
	/** Whether the binding carries an end stamp. */
	ended?: boolean;
}

/**
 * Liveness from the binding/hook lifecycle. An end stamp wins over every
 * event type: the last thing an agent does before dying is often a `Start`.
 */
export function deriveAgentSessionState({
	lastEventType,
	ended,
}: AgentSessionStateInput): AgentSessionState {
	if (ended) return "ended";
	if (!lastEventType) return "starting";
	if (lastEventType === "Start") return "working";
	if (lastEventType === "PermissionRequest") return "awaiting-input";
	if (lastEventType === "Failed") return "failed";
	// `Stop`, `Attached`, and anything a future provider invents: alive, not
	// working. Guessing "working" for an unknown event is the false claim.
	return "idle";
}

export interface AgentSessionResumableInput {
	/** The provider's own opaque conversation id, if one was captured. */
	agentSessionId?: string | null;
	/**
	 * The preset's resume contract — the args spliced before the session id
	 * (`claude --resume <id>`). Empty means the provider has no id-based
	 * resume, so no id can restore the conversation.
	 */
	resumeArgs?: readonly string[];
	lastEventType?: string | null;
	endedAt?: number | null;
}

/**
 * Whether `agentSessionId` can actually be handed back through
 * `agents create --resume-session`. Ending does not make a session
 * unresumable — parking a conversation and picking it up later is the
 * point. Never having started one does: providers only persist a
 * conversation once it has a message, so an id captured at attach time
 * resolves to "no conversation found".
 */
export function isAgentSessionResumable({
	agentSessionId,
	resumeArgs,
	lastEventType,
}: AgentSessionResumableInput): boolean {
	if (!agentSessionId) return false;
	if ((resumeArgs?.length ?? 0) === 0) return false;
	if (lastEventType === "Attached") return false;
	return true;
}

export interface AgentSessionIdentityInput extends AgentSessionResumableInput {
	/** Which agent must resume this session (`claude`, `codex`, …). */
	presetId?: string | null;
	/** Epoch ms, as stored on the binding row. */
	lastEventAt?: number | null;
	startedAt?: number | null;
	endReason?: string | null;
}

/** The agent half of an `agents create` / `agents get` payload. */
export interface AgentSessionIdentity {
	presetId: string | null;
	/** The provider's opaque conversation id, passed through untouched. */
	sessionId: string | null;
	resumable: boolean;
	state: AgentSessionState;
	lastEventType: string | null;
	lastEventAt: string | null;
	startedAt: string | null;
	ended: boolean;
	endedAt: string | null;
	endReason: string | null;
}

function toIso(epochMs: number | null | undefined): string | null {
	return epochMs === null || epochMs === undefined
		? null
		: new Date(epochMs).toISOString();
}

export function buildAgentSessionIdentity(
	input: AgentSessionIdentityInput,
): AgentSessionIdentity {
	const ended = input.endedAt !== null && input.endedAt !== undefined;
	return {
		presetId: input.presetId ?? null,
		sessionId: input.agentSessionId ?? null,
		resumable: isAgentSessionResumable(input),
		state: deriveAgentSessionState({
			lastEventType: input.lastEventType,
			ended,
		}),
		lastEventType: input.lastEventType ?? null,
		lastEventAt: toIso(input.lastEventAt),
		startedAt: toIso(input.startedAt),
		ended,
		endedAt: toIso(input.endedAt),
		endReason: input.endReason ?? null,
	};
}
