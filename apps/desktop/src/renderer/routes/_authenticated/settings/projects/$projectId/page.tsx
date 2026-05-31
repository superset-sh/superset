import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { NotFound } from "renderer/routes/not-found";
import { MOCK_ORG_ID } from "shared/constants";
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
	const collections = useCollections();
	const { data: session } = authClient.useSession();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: v2Match = [], isReady } = useLiveQuery(
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

	if (v2Match.length > 0) {
		return <V2ProjectSettings projectId={projectId} hostId={hostId ?? null} />;
	}
	if (!isReady) return null;
	return <NotFound />;
}
