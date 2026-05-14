import type { AgentDefinitionId, BuiltinAgentId } from "./agent-catalog";

/**
 * Runtime identity of an agent process detected by a Superset terminal hook.
 *
 * Reported by the in-shell `notify-hook.sh` script, broadcast over the
 * host-service event bus, and stored in renderer state keyed by terminalId.
 *
 * `agentId` is the wrapper-level id. Most values match `BuiltinAgentId` and
 * `PRESET_ICONS`; `droid` is managed by desktop setup but is not currently a
 * built-in terminal preset. `definitionId` is the user-customized id when the
 * launch path stamps it; it's reserved for a future PR — wrappers can't
 * distinguish user definitions on their own.
 */
export interface AgentIdentity {
	agentId: BuiltinAgentId | "droid";
	sessionId?: string;
	definitionId?: AgentDefinitionId;
}
