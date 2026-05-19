import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	const { data: v2Projects = [] } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({
					id: projects.id,
					name: projects.name,
				})),
		[collections, activeOrganizationId],
	);

	const firstProjectId = useMemo(() => {
		const v2Sorted = [...v2Projects].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		if (v2Sorted[0]) return v2Sorted[0].id;

		const loadedV2Ids = new Set(v2Projects.map((p) => p.id));
		const v1Sorted = groups
			.filter(
				(g) =>
					!g.project.neonProjectId || !loadedV2Ids.has(g.project.neonProjectId),
			)
			.map((g) => g.project)
			.sort((a, b) => a.name.localeCompare(b.name));
		return v1Sorted[0]?.id ?? null;
	}, [v2Projects, groups]);

	useEffect(() => {
		if (firstProjectId) {
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId: firstProjectId },
				replace: true,
			});
		}
	}, [firstProjectId, navigate]);

	const isEmpty = v2Projects.length === 0 && groups.length === 0;
	if (isEmpty) {
		return (
			<div className="flex items-center justify-center h-full p-6 text-sm text-muted-foreground">
				No projects yet.
			</div>
		);
	}

	return null;
}
