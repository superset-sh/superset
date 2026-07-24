import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNewWorkspaceScreenVariant } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/hooks/useNewWorkspaceScreenVariant";
import { NewWorkspaceEmptyScreen } from "./components/NewWorkspaceEmptyScreen";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	PROJECT_FILTER_ALL,
	useV2WorkspacesFilterStore,
} from "./stores/v2WorkspacesFilterStore";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
});

function V2WorkspacesPage() {
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const projectFilter = useV2WorkspacesFilterStore(
		(state) => state.projectFilter,
	);
	const setSearchQuery = useV2WorkspacesFilterStore(
		(state) => state.setSearchQuery,
	);

	useEffect(() => {
		setSearchQuery("");
	}, [setSearchQuery]);

	const { all, isReady, hostOptions, projectOptions, hostsById, projectsById } =
		useAccessibleV2Workspaces({
			searchQuery,
			deviceFilter,
			projectFilter,
		});

	// Experiment test arm: with zero workspaces the dashboard IS the create
	// screen — the "No workspaces yet" empty state never shows. Gated on
	// isReady (never pin over rows that are still settling) and on default
	// filters so a filtered-to-empty view keeps the normal empty state.
	// Evaluating the flag here is the exposure moment.
	const isEmptyDashboard =
		isReady &&
		all.length === 0 &&
		!searchQuery.trim() &&
		projectFilter === PROJECT_FILTER_ALL;
	const variant = useNewWorkspaceScreenVariant(isEmptyDashboard);
	if (variant === "test" && isEmptyDashboard) {
		return <NewWorkspaceEmptyScreen />;
	}

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<V2WorkspacesHeader
				hostOptions={hostOptions}
				projectOptions={projectOptions}
				hostsById={hostsById}
				projectsById={projectsById}
			/>
			<V2WorkspacesList workspaces={all} isReady={isReady} />
		</div>
	);
}
