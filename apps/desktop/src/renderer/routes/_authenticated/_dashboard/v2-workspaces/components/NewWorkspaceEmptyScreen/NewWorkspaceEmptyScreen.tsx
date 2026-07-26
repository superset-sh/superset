import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import { NewWorkspaceScreen } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen";
import { DashboardNewWorkspaceDraftProvider } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/DashboardNewWorkspaceDraftContext";

/**
 * Experiment test arm (new-workspace-screen): replaces the "No workspaces yet"
 * empty state with the create screen itself. With zero workspaces there is
 * nothing behind it, so it is pinned — close actions (Escape) are no-ops.
 * Store opens are not handled here: DashboardNewWorkspaceModal redirects them
 * to the /new-workspace route.
 */
export function NewWorkspaceEmptyScreen() {
	return (
		<DashboardNewWorkspaceDraftProvider onClose={() => {}}>
			<PromptInputProvider>
				<NewWorkspaceScreen isOpen preSelectedProjectId={null} />
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
