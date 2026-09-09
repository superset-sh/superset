import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import { createFileRoute } from "@tanstack/react-router";
import { NewWorkspaceScreen } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen";
import { DashboardNewWorkspaceDraftProvider } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/DashboardNewWorkspaceDraftContext";
import { newWorkspaceAttachmentsStore } from "renderer/stores/new-workspace-attachments";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/new-workspace/",
)({
	validateSearch: (
		search: Record<string, unknown>,
	): { projectId?: string; session?: boolean } => ({
		projectId:
			typeof search.projectId === "string" ? search.projectId : undefined,
		session: search.session === true ? true : undefined,
	}),
	component: NewWorkspacePage,
});

/**
 * The v2 create surface. It is a real route, not a dialog — every "new
 * workspace" entry point navigates here via `useOpenNewWorkspace`.
 */
function NewWorkspacePage() {
	const { projectId, session } = Route.useSearch();
	return (
		<DashboardNewWorkspaceDraftProvider onClose={() => {}}>
			<PromptInputProvider attachmentsStore={newWorkspaceAttachmentsStore}>
				<NewWorkspaceScreen
					isOpen
					preSelectedProjectId={projectId ?? null}
					preSelectedSession={session === true}
				/>
				{/* Window-drag surface replacing the hidden TopBar's drag region.
				    Stops short of the top-right corner so the screen's naming
				    instructions + prompt history buttons underneath stay
				    clickable. */}
				<div className="drag absolute left-0 right-20 top-0 z-50 h-12" />
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
