import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import {
	useOpenNewProjectModal,
	useOpenPinAndSetupModal,
	useTriggerFolderImport,
} from "renderer/stores/add-repository-modal";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	type AvailableV2Project,
	useAvailableV2Projects,
} from "./hooks/useAvailableV2Projects";
import { useV2WorkspacesFilterStore } from "./stores/v2WorkspacesFilterStore";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
});

function V2WorkspacesPage() {
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const resetFilters = useV2WorkspacesFilterStore((state) => state.reset);

	// Start with a fresh view every time the discovery page mounts — otherwise
	// the zustand singleton would carry over a stale search/device filter from a
	// previous visit with no visible indication that a filter is active.
	useEffect(() => {
		resetFilters();
	}, [resetFilters]);

	const { pinned, others, counts } = useAccessibleV2Workspaces({ searchQuery });
	const { projects: availableProjects } = useAvailableV2Projects({
		searchQuery,
	});
	const hasAnyAccessible = pinned.length > 0 || others.length > 0;

	const openNewProject = useOpenNewProjectModal();
	const openPinAndSetup = useOpenPinAndSetupModal();
	const triggerFolderImport = useTriggerFolderImport();

	const handlePinAndSetup = useCallback(
		(project: AvailableV2Project) => {
			openPinAndSetup({
				id: project.id,
				name: project.name,
				githubOwner: project.githubOwner,
				githubRepoName: project.githubRepoName,
			});
		},
		[openPinAndSetup],
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<V2WorkspacesHeader counts={counts} />
			<V2WorkspacesList
				pinned={pinned}
				others={others}
				availableProjects={availableProjects}
				hasAnyAccessible={hasAnyAccessible}
				onCreateNewProject={openNewProject}
				onImportExistingFolder={triggerFolderImport}
				onPinAndSetup={handlePinAndSetup}
			/>
		</div>
	);
}
