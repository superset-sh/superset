import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import { claudeSessionStore } from "./claude";
import { codexSessionStore } from "./codex";
import { opencodeSessionStore } from "./opencode";
import { piSessionStore } from "./pi";
import { toSessionQuery } from "./query";
import type { HarnessSessionRef, HarnessSessionStore } from "./types";

export { readHarnessSessionTitle } from "./title";
export type { HarnessTranscript } from "./transcript";
export type { HarnessSessionRef } from "./types";

/**
 * A harness without an entry keeps its sessions somewhere we cannot inspect
 * (grok's are server-side); the rest are unsurveyed.
 */
export const HARNESS_SESSION_STORES: Partial<
	Record<AgentIdentityId, HarnessSessionStore>
> = {
	claude: claudeSessionStore,
	codex: codexSessionStore,
	opencode: opencodeSessionStore,
	pi: piSessionStore,
};

/**
 * Whether the harness can still resolve a session id under the ref's env —
 * the env a relaunch or fork will run under, so a path reported by an
 * earlier launch on another account does not count.
 *
 * `true` and `false` are answers; `null` means this harness keeps its sessions
 * somewhere we cannot inspect and the caller must not treat that as absence.
 *
 * Forking a session the provider has pruned fails inside the freshly launched
 * pane, as the harness's own error, long after the click that asked for it.
 * Checking first turns that into a refusal at the point of asking.
 */
export function hasHarnessSession(ref: HarnessSessionRef): boolean | null {
	const resolved = toSessionQuery(ref);
	const store =
		resolved && HARNESS_SESSION_STORES[resolved.agentId as AgentIdentityId];
	if (!resolved || !store) return null;
	try {
		return store.hasSession(resolved.query);
	} catch {
		// An unreadable store is not evidence the session is gone.
		return null;
	}
}
