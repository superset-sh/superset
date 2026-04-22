import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { HiOutlineFolder } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { SettingsSection } from "renderer/stores/settings-state";
import { MOCK_ORG_ID } from "shared/constants";

interface ProjectsSettingsProps {
	isSearchActive: boolean;
	matchCounts: Partial<Record<SettingsSection, number>> | null;
}

export function ProjectsSettings({
	isSearchActive,
	matchCounts,
}: ProjectsSettingsProps) {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const matchRoute = useMatchRoute();
	const collections = useCollections();
	const { data: session } = authClient.useSession();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

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

	const hasProjectMatches = (matchCounts?.project ?? 0) > 0;

	if (isSearchActive && !hasProjectMatches) {
		return null;
	}

	if (groups.length === 0 && v2Projects.length === 0) {
		return null;
	}

	const isActive = !!matchRoute({
		to: "/settings/projects",
		fuzzy: true,
	});

	const count = matchCounts?.project;

	return (
		<div className="mt-4">
			<h2 className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.1em] px-3 mb-1">
				Projects
			</h2>
			<nav className="flex flex-col">
				<Link
					to="/settings/projects"
					className={cn(
						"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
						isActive
							? "bg-accent text-accent-foreground"
							: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
					)}
				>
					<HiOutlineFolder className="h-4 w-4" />
					<span className="flex-1">Projects</span>
					{count !== undefined && count > 0 && (
						<span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
							{count}
						</span>
					)}
				</Link>
			</nav>
		</div>
	);
}
