import { appState } from "main/lib/app-state";
import type { V1PaneAgentSession } from "main/lib/app-state/schemas";
import { mapEventType } from "./map-event-type";

/**
 * Tracks the last CLI agent session per v1 terminal pane so the v1→v2
 * migration can seed a resume candidate for the pane's recreated terminal
 * (same banner + detection as host-service terminal_agent_bindings). Fed by
 * the hook server's `rawEventType`/`agentId` params — the legacy `eventType`
 * collapses SessionStart/SessionEnd into Start/Stop and can't distinguish a
 * clean quit from a turn boundary.
 *
 * Detection mirrors host-service persistence:
 * - never-prompted sessions aren't resumable (no persisted conversation)
 * - the agent's own SessionEnd goodbye marks a clean quit (not resumable)
 * - a goodbye within 30s of the pane's terminal death is a death gasp
 *   (agents run SessionEnd hooks on SIGHUP) and is upgraded back
 * - a straggler event within 30s of a goodbye must not revive the record
 */

const SESSION_START_EVENTS = new Set([
	"SessionStart",
	"sessionStart",
	"session_start",
	"Attached",
	"attached",
]);

const SESSION_END_EVENTS = new Set([
	"SessionEnd",
	"sessionEnd",
	"session_end",
	"Detached",
	"detached",
]);

/** Mirrors host-service DEATH_GASP_DETACH_WINDOW_MS. */
const DEATH_GASP_WINDOW_MS = 30_000;

/** Mirrors host-service END_STRAGGLER_WINDOW_MS. */
const END_STRAGGLER_WINDOW_MS = 30_000;

export interface V1AgentHookEvent {
	rawEventType: string;
	agentId: string;
	agentSessionId?: string;
	at: number;
}

/**
 * Next record for a pane after a hook event, or undefined when the event
 * changes nothing. Pure so the transitions are testable.
 */
export function applyV1AgentHookEvent(
	existing: V1PaneAgentSession | undefined,
	event: V1AgentHookEvent,
): V1PaneAgentSession | undefined {
	const { rawEventType, agentId, agentSessionId, at } = event;

	if (SESSION_END_EVENTS.has(rawEventType)) {
		if (!existing || existing.endedAt !== undefined) return undefined;
		// A goodbye from some other agent or session must not end this one.
		if (agentId !== existing.agentId) return undefined;
		if (
			agentSessionId !== undefined &&
			agentSessionId !== existing.agentSessionId
		) {
			return undefined;
		}
		return { ...existing, endedAt: at, updatedAt: at };
	}

	if (SESSION_START_EVENTS.has(rawEventType)) {
		if (!agentSessionId) return undefined;
		if (
			existing?.agentId === agentId &&
			existing.agentSessionId === agentSessionId
		) {
			// Same session starting again (e.g. resumed in place): the
			// conversation still exists, so keep `prompted`; it is live again,
			// so drop any goodbye. Nothing material changes otherwise.
			if (existing.endedAt === undefined) return undefined;
			return { ...existing, endedAt: undefined, updatedAt: at };
		}
		return { agentId, agentSessionId, prompted: false, updatedAt: at };
	}

	// Anything else the v1 status pipeline understands (prompt submitted,
	// stop, permission request, tool use) means the session has a message.
	if (mapEventType(rawEventType) === null) return undefined;

	// Never inherit a session id across an agent or session change (mirrors
	// the v2 store): a codex event landing on a claude record must not mint
	// a codex candidate pointing at the claude session.
	const identityChanged =
		existing !== undefined &&
		(agentId !== existing.agentId ||
			(agentSessionId !== undefined &&
				agentSessionId !== existing.agentSessionId));

	if (existing === undefined || identityChanged) {
		if (!agentSessionId) return undefined;
		return { agentId, agentSessionId, prompted: true, updatedAt: at };
	}

	if (existing.endedAt !== undefined) {
		// Straggler from the ended session (async notify callbacks, in-flight
		// curls) — reviving would erase the clean-quit marker. An event well
		// past the goodbye is a real relaunch without session-start hooks.
		if (at - existing.endedAt <= END_STRAGGLER_WINDOW_MS) return undefined;
		return { ...existing, prompted: true, endedAt: undefined, updatedAt: at };
	}

	// Only persist material changes — hook events stream steadily while an
	// agent works, and each write rewrites all of app-state.json.
	if (existing.prompted) return undefined;
	return { ...existing, prompted: true, updatedAt: at };
}

/**
 * Next record after the pane's terminal died, or undefined when nothing
 * changes. A goodbye recorded moments before the death was the agent's
 * SIGHUP death gasp, not a user quit — clear it so the session stays a
 * resume candidate (mirrors the host-service detach upgrade).
 */
export function applyV1TerminalExit(
	existing: V1PaneAgentSession | undefined,
	at: number,
): V1PaneAgentSession | undefined {
	if (existing?.endedAt === undefined) return undefined;
	if (at - existing.endedAt > DEATH_GASP_WINDOW_MS) return undefined;
	return { ...existing, endedAt: undefined, updatedAt: at };
}

function persist(paneId: string, next: V1PaneAgentSession): void {
	appState.data.v1AgentSessions = {
		...(appState.data.v1AgentSessions ?? {}),
		[paneId]: next,
	};
	void appState.write().catch((err) => {
		console.error("[v1-agent-sessions] app-state write failed", err);
	});
}

export function recordV1AgentHookEvent(
	paneId: string,
	event: V1AgentHookEvent,
): void {
	const next = applyV1AgentHookEvent(
		appState.data.v1AgentSessions?.[paneId],
		event,
	);
	if (next) persist(paneId, next);
}

export function recordV1TerminalExit(paneId: string): void {
	const next = applyV1TerminalExit(
		appState.data.v1AgentSessions?.[paneId],
		Date.now(),
	);
	if (next) persist(paneId, next);
}
