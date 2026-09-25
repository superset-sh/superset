import type { AgentDefinitionId, AgentIdentityId } from "./agent-catalog";

/**
 * Runtime identity of an agent process detected by a Superset terminal hook.
 *
 * Reported by the in-shell `notify-hook.sh` script, broadcast over the
 * host-service event bus, and stored in renderer state keyed by terminalId.
 *
 * `agentId` is the wrapper-level id and matches `AgentIdentityId` /
 * `PRESET_ICONS`. `definitionId` is the user-customized id when the launch
 * path stamps it; it's reserved for a future PR — wrappers can't distinguish
 * user definitions on their own.
 */
export interface AgentIdentity {
	agentId: AgentIdentityId;
	sessionId?: string;
	definitionId?: AgentDefinitionId;
}
