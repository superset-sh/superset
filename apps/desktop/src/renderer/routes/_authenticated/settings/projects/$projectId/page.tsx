import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { NotFound } from "renderer/routes/not-found";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { ProjectSettings } from "../../project/$projectId/components/ProjectSettings";
import { getMatchingItemsForSection } from "../../utils/settings-search";
import { V2ProjectSettings } from "../../v2-project/$projectId/components/V2ProjectSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/projects/$projectId/",
)({
	component: ProjectDetailPage,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const { hostId } = Route.useSearch();
	const searchQuery = useSettingsSearchQuery();

	const { projects: hostProjects, isReady } = useHostProjects();
	const v2Match = useMemo(
		() => hostProjects.filter((project) => project.projectKey === projectId),
		[hostProjects, projectId],
	);

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "project").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	if (v2Match.length > 0) {
		return <V2ProjectSettings projectId={projectId} hostId={hostId ?? null} />;
	}
	// Cache-first rule: no match + hosts not settled = loading, not the v1
	// fallback — otherwise every v2 project flashes the legacy settings page.
	if (!isReady) return null;
	return <ProjectSettings projectId={projectId} visibleItems={visibleItems} />;
}
