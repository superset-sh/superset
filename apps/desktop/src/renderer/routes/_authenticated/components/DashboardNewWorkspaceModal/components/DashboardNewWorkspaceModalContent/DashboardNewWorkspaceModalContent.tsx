import { useEffect, useMemo, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { PromptGroup } from "../DashboardNewWorkspaceForm/PromptGroup";
import { useSelectedHostProjectIds } from "./hooks/useSelectedHostProjectIds";

interface DashboardNewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

/**
 * Content pane for the Dashboard new-workspace modal.
 *
 * Resolves the project list from the host fan-out (projects are fully
 * local) and handles the initial project selection when the modal opens.
 * Delegates the composer itself to PromptGroup.
 */
export function DashboardNewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
}: DashboardNewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useDashboardNewWorkspaceDraft();
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const { projects: hostProjects, isReady: areProjectsReady } =
		useHostProjects();

	const setUpProjectIds = useSelectedHostProjectIds(draft.hostId);

	const recentProjects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
				githubOwner: project.repoOwner,
				githubRepoName: project.repoName,
				iconUrl: project.repoOwner
					? `https://github.com/${project.repoOwner}.png?size=64`
					: null,
				needsSetup:
					setUpProjectIds === null
						? null
						: !setUpProjectIds.has(project.projectKey),
			})),
		[hostProjects, setUpProjectIds],
	);
	const appliedPreSelectionRef = useRef<string | null>(null);
	const appliedHostIdRef = useRef(false);
	const hasInitializedSelectionRef = useRef(false);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
			appliedHostIdRef.current = false;
			hasInitializedSelectionRef.current = false;
			return;
		}
		if (appliedHostIdRef.current) return;
		appliedHostIdRef.current = true;
		const persistedHostId =
			useV2WorkspaceCreateDefaultsStore.getState().lastHostId;
		if (typeof persistedHostId === "string") {
			updateDraft({ hostId: persistedHostId });
		}
	}, [isOpen, updateDraft]);

	useEffect(() => {
		if (!isOpen) return;

		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current
		) {
			if (!areProjectsReady) return;
			const hasPreSelectedProject = recentProjects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				hasInitializedSelectionRef.current = true;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		if (!areProjectsReady) return;

		// Only auto-pick a default once. After init, leave the user's selection
		// alone — including freshly created projects that may not be in the live
		// query yet (they'll appear momentarily and the picker will show them).
		if (hasInitializedSelectionRef.current) return;

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			const { lastProjectId } = useV2WorkspaceCreateDefaultsStore.getState();
			const persistedProjectId =
				lastProjectId &&
				recentProjects.some((project) => project.id === lastProjectId)
					? lastProjectId
					: null;
			updateDraft({
				selectedProjectId: persistedProjectId ?? recentProjects[0]?.id ?? null,
			});
		}
		hasInitializedSelectionRef.current = true;
	}, [
		draft.selectedProjectId,
		areProjectsReady,
		isOpen,
		preSelectedProjectId,
		recentProjects,
		updateDraft,
	]);

	const selectedProject = recentProjects.find(
		(project) => project.id === draft.selectedProjectId,
	);

	return (
		<div className="flex-1 overflow-y-auto">
			<PromptGroup
				projectId={draft.selectedProjectId}
				selectedProject={selectedProject}
				recentProjects={recentProjects.filter((project) => Boolean(project.id))}
				onSelectProject={(selectedProjectId) => {
					setLastProjectId(selectedProjectId);
					updateDraft({ selectedProjectId });
				}}
			/>
		</div>
	);
}
