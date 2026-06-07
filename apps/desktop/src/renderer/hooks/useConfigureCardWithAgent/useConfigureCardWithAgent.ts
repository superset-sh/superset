import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";

export const CONFIGURE_CARD_PROMPT = `Open .superset/config.json in this repository and help me adjust the "workspaceCard" block. It is the repo-shared default for which lines the sidebar workspace cards show. Schema: boolean fields prTitle, prChecks, diffStats, status, linearTicket (all default to true), plus a customLines array. Each customLines entry is one of two shapes, discriminated by "type": (1) command lines — { id, type: "command", label, command, enabled } — the shell command runs in the workspace folder and the first line of its output shows on the card ("type" may be omitted; it defaults to "command"); (2) component lines — { id, type: "component", label, component, enabled } — "component" names a built-in app widget. Valid component keys: "pomodoro" (elapsed time since workspace creation as 25-minute pomodoro cycles), "clock" (current local time), "pr-checks-inline" (compact PR checks summary). Unknown component keys render nothing. "id" must be unique per line; "label" is an optional prefix; "enabled" defaults to true. The full reference lives in docs/WORKSPACE_CARDS.md of the superset repo if available. Ask me which lines I want visible and whether I want custom lines, then update the file accordingly, preserving every other key in the config. Note: the app's card settings only override this file on a machine when they diverge from it.`;

/**
 * "Configure card with agent": pre-fills the new-workspace prompt and opens
 * the creation modal — same flow as setup/teardown script configuration. The
 * user reviews and submits; nothing starts automatically.
 */
export function useConfigureCardWithAgent(projectId: string): () => void {
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const openNewWorkspaceModal = useNewWorkspaceModalStore((s) => s.openModal);

	return () => {
		updateDraft({
			prompt: CONFIGURE_CARD_PROMPT,
			selectedProjectId: projectId,
		});
		openNewWorkspaceModal(projectId);
	};
}
