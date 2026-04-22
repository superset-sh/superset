import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

interface ProjectRow {
	kind: "v1" | "v2";
	id: string;
	name: string;
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

	const { v2Rows, v1Rows } = useMemo(() => {
		const loadedV2Ids = new Set(v2Projects.map((p) => p.id));

		const v2Rows: ProjectRow[] = v2Projects.map((p) => ({
			kind: "v2",
			id: p.id,
			name: p.name,
		}));

		const v1Rows: ProjectRow[] = groups
			.filter(
				(g) =>
					!g.project.neonProjectId || !loadedV2Ids.has(g.project.neonProjectId),
			)
			.map((g) => ({
				kind: "v1",
				id: g.project.id,
				name: g.project.name,
			}));

		return { v2Rows, v1Rows };
	}, [groups, v2Projects]);

	const isEmpty = v2Rows.length === 0 && v1Rows.length === 0;
	const showHeaders = v2Rows.length > 0 && v1Rows.length > 0;

	return (
		<div className="w-64 shrink-0 border-r overflow-y-auto">
			<div className="p-3 space-y-4">
				{isEmpty && (
					<p className="px-2 text-sm text-muted-foreground">No projects yet.</p>
				)}
				{v2Rows.length > 0 && (
					<Section title={showHeaders ? "v2" : null}>
						{v2Rows.map((row) => (
							<ProjectLink
								key={`v2:${row.id}`}
								row={row}
								isActive={row.id === selectedProjectId}
							/>
						))}
					</Section>
				)}
				{v1Rows.length > 0 && (
					<Section title={showHeaders ? "v1" : null}>
						{v1Rows.map((row) => (
							<ProjectLink
								key={`v1:${row.id}`}
								row={row}
								isActive={row.id === selectedProjectId}
							/>
						))}
					</Section>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string | null;
	children: React.ReactNode;
}) {
	return (
		<div>
			{title && (
				<h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
					{title}
				</h2>
			)}
			<nav className="flex flex-col gap-0.5">{children}</nav>
		</div>
	);
}

function ProjectLink({
	row,
	isActive,
}: {
	row: ProjectRow;
	isActive: boolean;
}) {
	return (
		<Link
			to="/settings/projects/$projectId"
			params={{ projectId: row.id }}
			className={cn(
				"flex items-center px-2 py-1.5 text-sm rounded-md transition-colors",
				isActive
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			<span className="truncate">{row.name}</span>
		</Link>
	);
}
