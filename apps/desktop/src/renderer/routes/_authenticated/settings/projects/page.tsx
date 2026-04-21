import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { HiChevronRight, HiOutlineCloud } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

export const Route = createFileRoute("/_authenticated/settings/projects/")({
	component: ProjectsListPage,
});

interface ProjectRow {
	kind: "v1" | "v2";
	id: string;
	name: string;
	subtitle: string | null;
	color: string | null;
}

function ProjectsListPage() {
	const navigate = useNavigate();
	const collections = useCollections();
	const { data: session } = authClient.useSession();

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
				.select(({ projects }) => ({ ...projects })),
		[collections, activeOrganizationId],
	);

	const rows = useMemo<ProjectRow[]>(() => {
		const linkedV2Ids = new Set(
			groups
				.map((g) => g.project.neonProjectId)
				.filter((id): id is string => !!id),
		);

		const v2Rows: ProjectRow[] = v2Projects.map((p) => ({
			kind: "v2",
			id: p.id,
			name: p.name,
			subtitle: p.repoCloneUrl ?? null,
			color: null,
		}));

		const v1Rows: ProjectRow[] = groups
			.filter((g) => !g.project.neonProjectId || !linkedV2Ids.has(g.project.neonProjectId))
			.map((g) => ({
				kind: "v1",
				id: g.project.id,
				name: g.project.name,
				subtitle: g.project.mainRepoPath,
				color: g.project.color,
			}));

		return [...v2Rows, ...v1Rows];
	}, [groups, v2Projects]);

	const handleSelect = (row: ProjectRow) => {
		if (row.kind === "v2") {
			navigate({
				to: "/settings/v2-project/$projectId/general",
				params: { projectId: row.id },
			});
		} else {
			navigate({
				to: "/settings/project/$projectId/general",
				params: { projectId: row.id },
			});
		}
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Projects</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Select a project to configure its settings
				</p>
			</div>

			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No projects yet. Import a repository to get started.
				</p>
			) : (
				<div className="space-y-1">
					{rows.map((row) => (
						<button
							key={`${row.kind}:${row.id}`}
							type="button"
							onClick={() => handleSelect(row)}
							className={cn(
								"flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors text-left",
								"hover:bg-accent/50 group",
							)}
						>
							{row.color ? (
								<div
									className="w-3 h-3 rounded-full shrink-0"
									style={{ backgroundColor: row.color }}
								/>
							) : (
								<HiOutlineCloud className="w-4 h-4 shrink-0 text-muted-foreground" />
							)}
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{row.name}</p>
								{row.subtitle && (
									<p className="text-xs text-muted-foreground truncate">
										{row.subtitle}
									</p>
								)}
							</div>
							<HiChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
						</button>
					))}
				</div>
			)}
		</div>
	);
}
