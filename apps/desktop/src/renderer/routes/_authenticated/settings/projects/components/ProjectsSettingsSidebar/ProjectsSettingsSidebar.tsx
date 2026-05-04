import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { MOCK_ORG_ID } from "shared/constants";

interface ProjectRow {
	kind: "v1" | "v2";
	id: string;
	name: string;
	iconUrl: string | null;
}

interface ProjectsSettingsSidebarProps {
	selectedProjectId: string | null;
}

export function ProjectsSettingsSidebar({
	selectedProjectId,
}: ProjectsSettingsSidebarProps) {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const [filter, setFilter] = useState("");

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
					iconUrl: projects.iconUrl,
				})),
		[collections, activeOrganizationId],
	);

	const { v2Rows, v1Rows, totalUnfiltered } = useMemo(() => {
		const loadedV2Ids = new Set(v2Projects.map((p) => p.id));

		const allV2: ProjectRow[] = v2Projects.map((p) => ({
			kind: "v2",
			id: p.id,
			name: p.name,
			iconUrl: p.iconUrl ?? null,
		}));

		const allV1: ProjectRow[] = groups
			.filter(
				(g) =>
					!g.project.neonProjectId || !loadedV2Ids.has(g.project.neonProjectId),
			)
			.map((g) => ({
				kind: "v1",
				id: g.project.id,
				name: g.project.name,
				iconUrl: g.project.iconUrl,
			}));

		const trimmed = filter.trim().toLowerCase();
		const matches = (rows: ProjectRow[]) =>
			trimmed
				? rows.filter((r) => r.name.toLowerCase().includes(trimmed))
				: rows;

		return {
			v2Rows: matches(allV2),
			v1Rows: matches(allV1),
			totalUnfiltered: allV2.length + allV1.length,
		};
	}, [groups, v2Projects, filter]);

	const isEmpty = totalUnfiltered === 0;
	const noMatches =
		!isEmpty && v2Rows.length === 0 && v1Rows.length === 0 && filter !== "";
	const showHeaders = v2Rows.length > 0 && v1Rows.length > 0;

	return (
		<div className="w-64 shrink-0 border-r overflow-y-auto">
			<div className="p-3 space-y-3">
				{!isEmpty && (
					<div className="relative">
						<HiMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
						<input
							type="text"
							placeholder="Filter projects..."
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							className="w-full h-8 pl-8 pr-2 text-sm bg-accent/50 rounded-md border-0 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
						/>
					</div>
				)}
				{isEmpty && (
					<p className="px-2 text-sm text-muted-foreground">No projects yet.</p>
				)}
				{noMatches && (
					<p className="px-2 text-sm text-muted-foreground">
						No projects match "{filter}".
					</p>
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
				"flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors",
				isActive
					? "bg-accent text-accent-foreground"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
			)}
		>
			<ProjectThumbnail
				projectName={row.name}
				iconUrl={row.iconUrl}
				className="size-5"
			/>
			<span className="truncate">{row.name}</span>
		</Link>
	);
}
