import { FEATURE_FLAGS } from "@superset/shared/constants";
import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { HiOutlineFolder } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { SettingsSection } from "renderer/stores/settings-state";

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
	const hasCloudAccess = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_ACCESS);

	const hasProjectMatches = (matchCounts?.project ?? 0) > 0;

	if (isSearchActive && !hasProjectMatches) {
		return null;
	}

	if (groups.length === 0) {
		return null;
	}

	// Check if we're on the projects list or any project settings page
	const isProjectsListActive = matchRoute({ to: "/settings/projects" });
	const isAnyProjectActive = groups.some(
		(group) =>
			matchRoute({
				to: "/settings/project/$projectId/general",
				params: { projectId: group.project.id },
			}) ||
			(hasCloudAccess &&
				matchRoute({
					to: "/settings/project/$projectId/cloud/secrets",
					params: { projectId: group.project.id },
				})),
	);
	const isActive = !!isProjectsListActive || isAnyProjectActive;

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
