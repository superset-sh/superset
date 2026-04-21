import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import { HiOutlineCloud } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

interface ProjectRow {
	kind: "v1" | "v2";
	id: string;
	name: string;
	subtitle: string | null;
	color: string | null;
}

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: ProjectsSettingsSidebarProps) {
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
			.filter(
				(g) =>
					!g.project.neonProjectId ||
					!linkedV2Ids.has(g.project.neonProjectId),
			)
			.map((g) => ({
				kind: "v1",
				id: g.project.id,
				name: g.project.name,
				subtitle: g.project.mainRepoPath,
				color: g.project.color,
			}));

		return [...v2Rows, ...v1Rows];
	}, [groups, v2Projects]);

	return (
		<div className="w-64 shrink-0 border-r overflow-y-auto">
			<div className="p-3">
				<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
					Projects
				</h2>
				{rows.length === 0 ? (
					<p className="px-2 text-sm text-muted-foreground">
						No projects yet.
					</p>
				) : (
					<nav className="flex flex-col gap-0.5">
						{rows.map((row) => {
							const isActive = row.id === selectedProjectId;
							return (
								<Link
									key={`${row.kind}:${row.id}`}
									to="/settings/projects/$projectId"
									params={{ projectId: row.id }}
									className={cn(
										"flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
										isActive
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
									)}
								>
									{row.color ? (
										<div
											className="w-2.5 h-2.5 rounded-full shrink-0"
											style={{ backgroundColor: row.color }}
										/>
									) : (
										<HiOutlineCloud className="w-3.5 h-3.5 shrink-0" />
									)}
									<span className="truncate">{row.name}</span>
								</Link>
							);
						})}
					</nav>
				)}
			</div>
		</div>
	);
}
