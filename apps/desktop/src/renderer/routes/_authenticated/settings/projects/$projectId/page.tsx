import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { NotFound } from "renderer/routes/not-found";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { MOCK_ORG_ID } from "shared/constants";
import { ProjectSettings } from "../../project/$projectId/components/ProjectSettings";
import { getMatchingItemsForSection } from "../../utils/settings-search";
import { V2ProjectSettings } from "../../v2-project/$projectId/components/V2ProjectSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/projects/$projectId/",
)({
	component: ProjectDetailPage,
	notFoundComponent: NotFound,
});

function ProjectDetailPage() {
	const { projectId } = Route.useParams();
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const searchQuery = useSettingsSearchQuery();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: v2Match = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) => eq(projects.id, projectId))
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({ id: projects.id })),
		[collections, projectId, activeOrganizationId],
	);

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "project").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	if (v2Match.length > 0) {
		return <V2ProjectSettings projectId={projectId} />;
	}
	return <ProjectSettings projectId={projectId} visibleItems={visibleItems} />;
}
