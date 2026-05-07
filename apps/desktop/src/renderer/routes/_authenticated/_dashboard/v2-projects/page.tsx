import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { V2ProjectsHeader } from "./components/V2ProjectsHeader";
import { V2ProjectsList } from "./components/V2ProjectsList";
import { useAccessibleV2Projects } from "./hooks/useAccessibleV2Projects";
import { useV2ProjectsFilterStore } from "./stores/v2ProjectsFilterStore";

export const Route = createFileRoute("/_authenticated/_dashboard/v2-projects/")(
	{
		component: V2ProjectsPage,
	},
);

function V2ProjectsPage() {
	const searchQuery = useV2ProjectsFilterStore((state) => state.searchQuery);
	const resetFilters = useV2ProjectsFilterStore((state) => state.reset);

	useEffect(() => {
		resetFilters();
	}, [resetFilters]);

	const projects = useAccessibleV2Projects({ searchQuery });

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-card">
			<V2ProjectsHeader totalCount={projects.length} />
			<V2ProjectsList projects={projects} />
		</div>
	);
}
