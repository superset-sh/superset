import { useEffect, useRef } from "react";
import { useV2ProjectList } from "renderer/routes/_authenticated/hooks/useV2ProjectList";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { PromptGroup } from "../DashboardNewWorkspaceForm/PromptGroup";

interface DashboardNewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

/**
 * Content pane for the Dashboard new-workspace modal.
 *
 * Resolves the project list from V2 collections (`v2Projects` +
 * `githubRepositories`) and handles the initial project selection when the
 * modal opens. Delegates the composer itself to PromptGroup.
 */
export function DashboardNewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
}: DashboardNewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useDashboardNewWorkspaceDraft();

	const recentProjects = useV2ProjectList();
	const areProjectsReady = recentProjects !== undefined;
	const appliedPreSelectionRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current
		) {
			if (!areProjectsReady || !recentProjects) return;
			const hasPreSelectedProject = recentProjects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		if (!areProjectsReady || !recentProjects) return;

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			updateDraft({ selectedProjectId: recentProjects[0]?.id ?? null });
		}
	}, [
		draft.selectedProjectId,
		areProjectsReady,
		isOpen,
		preSelectedProjectId,
		recentProjects,
		updateDraft,
	]);

	const projects = recentProjects ?? [];
	const selectedProject = projects.find(
		(project) => project.id === draft.selectedProjectId,
	);

	return (
		<div className="flex-1 overflow-y-auto">
			<PromptGroup
				projectId={draft.selectedProjectId}
				selectedProject={selectedProject}
				recentProjects={projects.filter((project) => Boolean(project.id))}
				onSelectProject={(selectedProjectId) =>
					updateDraft({ selectedProjectId })
				}
			/>
		</div>
	);
}
