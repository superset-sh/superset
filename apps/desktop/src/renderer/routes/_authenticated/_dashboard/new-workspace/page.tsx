import { PromptInputProvider } from "@superset/ui/ai-elements/prompt-input";
import { createFileRoute } from "@tanstack/react-router";
import { NewWorkspaceScreen } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen";
import { DashboardNewWorkspaceDraftProvider } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/DashboardNewWorkspaceDraftContext";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/new-workspace/",
)({
	validateSearch: (
		search: Record<string, unknown>,
	): { projectId?: string } => ({
		projectId:
			typeof search.projectId === "string" ? search.projectId : undefined,
	}),
	component: NewWorkspacePage,
});

/**
 * Experiment test arm (new-workspace-screen): the create surface as a real
 * route. Store opens are redirected here by DashboardNewWorkspaceModal.
 */
function NewWorkspacePage() {
	const { projectId } = Route.useSearch();
	return (
		<DashboardNewWorkspaceDraftProvider onClose={() => {}}>
			<PromptInputProvider>
				<NewWorkspaceScreen isOpen preSelectedProjectId={projectId ?? null} />
				{/* Window-drag surface replacing the hidden TopBar's drag region. */}
				<div className="drag absolute inset-x-0 top-0 z-50 h-12" />
			</PromptInputProvider>
		</DashboardNewWorkspaceDraftProvider>
	);
}
