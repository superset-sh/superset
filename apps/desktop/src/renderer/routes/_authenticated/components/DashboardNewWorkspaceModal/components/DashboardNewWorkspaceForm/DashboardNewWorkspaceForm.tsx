import { useCallback } from "react";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { DashboardNewWorkspaceFormHeader } from "./components/DashboardNewWorkspaceFormHeader";
import { DashboardNewWorkspaceListTabContent } from "./components/DashboardNewWorkspaceListTabContent";
import { DashboardNewWorkspacePromptTabContent } from "./components/DashboardNewWorkspacePromptTabContent";
import { useDashboardNewWorkspaceProjectSelection } from "./hooks/useDashboardNewWorkspaceProjectSelection";
import { useResolvedLocalProject } from "./hooks/useResolvedLocalProject";

interface DashboardNewWorkspaceFormProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

/** Main form for the new workspace modal with collection-based project selection. */
export function DashboardNewWorkspaceForm({
	isOpen,
	preSelectedProjectId,
}: DashboardNewWorkspaceFormProps) {
	const { draft, updateDraft } = useDashboardNewWorkspaceDraft();
	const handleSelectProject = useCallback(
		(selectedProjectId: string | null) => {
			updateDraft({ selectedProjectId });
		},
		[updateDraft],
	);
	const { githubRepository, githubRepositoryId } =
		useDashboardNewWorkspaceProjectSelection({
			isOpen,
			preSelectedProjectId,
			selectedProjectId: draft.selectedProjectId,
			onSelectProject: handleSelectProject,
		});
	const resolvedLocalProjectId = useResolvedLocalProject(githubRepository);

	const listTab = draft.activeTab === "prompt" ? null : draft.activeTab;
	const isListTab = listTab !== null;
	const listQuery =
		draft.activeTab === "issues"
			? draft.issuesQuery
			: draft.activeTab === "branches"
				? draft.branchesQuery
				: draft.pullRequestsQuery;

	const handleListQueryChange = (value: string) => {
		switch (draft.activeTab) {
			case "issues":
				updateDraft({ issuesQuery: value });
				return;
			case "branches":
				updateDraft({ branchesQuery: value });
				return;
			case "pull-requests":
				updateDraft({ pullRequestsQuery: value });
				return;
			default:
				return;
		}
	};

	return (
		<>
			<DashboardNewWorkspaceFormHeader
				activeTab={draft.activeTab}
				hostTarget={draft.hostTarget}
				selectedProjectId={draft.selectedProjectId}
				onSelectTab={(activeTab) => updateDraft({ activeTab })}
				onSelectHostTarget={(hostTarget) => updateDraft({ hostTarget })}
				onSelectProject={handleSelectProject}
			/>

			{isListTab ? (
				<DashboardNewWorkspaceListTabContent
					activeTab={listTab}
					projectId={draft.selectedProjectId}
					githubRepositoryId={githubRepositoryId}
					hostTarget={draft.hostTarget}
					localProjectId={resolvedLocalProjectId}
					query={listQuery}
					onQueryChange={handleListQueryChange}
				/>
			) : (
				<DashboardNewWorkspacePromptTabContent
					projectId={draft.selectedProjectId}
					localProjectId={resolvedLocalProjectId}
					hostTarget={draft.hostTarget}
				/>
			)}
		</>
	);
}
