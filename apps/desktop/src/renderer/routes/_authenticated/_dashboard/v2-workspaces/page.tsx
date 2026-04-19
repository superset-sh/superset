import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
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

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<V2WorkspacesHeader counts={counts} />
			<V2WorkspacesList pinned={pinned} others={others} />
		</div>
	);
}
