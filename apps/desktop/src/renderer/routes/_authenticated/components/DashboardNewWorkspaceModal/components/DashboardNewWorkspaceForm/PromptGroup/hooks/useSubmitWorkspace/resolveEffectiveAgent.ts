import type { WorkspaceCreateAgent } from "../../types";

interface ResolveEffectiveAgentArgs {
	/** Current selection from `useAgentLaunchPreferences` (may still be "none"). */
	selectedAgent: WorkspaceCreateAgent;
	/** Configured agent ids for the launch host, in display order. */
	selectableAgentIds: readonly string[];
	/**
	 * True when the user explicitly picked "No agent" (persisted as "none").
	 * Distinguishes a deliberate "none" from the placeholder "none" that
	 * `useAgentLaunchPreferences` starts with before the promotion effect runs.
	 */
	userChoseNone: boolean;
}

/**
 * Resolves the agent to launch at submit time.
 *
 * `selectedAgent` initializes to the placeholder "none" and is only promoted
 * to the first configured agent by a `useEffect` after `v2AgentsFetched`. A
 * quick submit (Cmd+Enter right after opening the modal) can fire before that
 * effect commits, leaving `selectedAgent === "none"` even though agents are
 * loaded — which drops the typed prompt to `namingPrompt` and never launches
 * an agent. Mirroring the promotion logic synchronously here closes that race
 * so the prompt reliably reaches the first configured agent.
 *
 * The placeholder is only promoted when agents have actually loaded
 * (`selectableAgentIds` non-empty) and the user did not explicitly choose
 * "none".
 */
export function resolveEffectiveAgent({
	selectedAgent,
	selectableAgentIds,
	userChoseNone,
}: ResolveEffectiveAgentArgs): WorkspaceCreateAgent {
	if (selectedAgent !== "none") return selectedAgent;
	if (userChoseNone) return "none";
	return selectableAgentIds[0] ?? "none";
}
