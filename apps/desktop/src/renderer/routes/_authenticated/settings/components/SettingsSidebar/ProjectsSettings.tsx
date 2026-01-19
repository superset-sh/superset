import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getMatchCountBySection } from "../../utils/settings-search";

interface ProjectsSettingsProps {
	searchQuery: string;
}

export function ProjectsSettings({ searchQuery }: ProjectsSettingsProps) {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const matchRoute = useMatchRoute();
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
		new Set(),
	);

	// Check if project/workspace sections have matches during search
	const matchCounts = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchCountBySection(searchQuery);
	}, [searchQuery]);

	const hasProjectMatches = (matchCounts?.project ?? 0) > 0;
	const hasWorkspaceMatches = (matchCounts?.workspace ?? 0) > 0;
	const hasAnyMatches = hasProjectMatches || hasWorkspaceMatches;

	// Expand all projects by default when groups are loaded
	useEffect(() => {
		if (groups.length > 0) {
			setExpandedProjects(new Set(groups.map((g) => g.project.id)));
		}
	}, [groups]);

	const toggleProject = (projectId: string) => {
		setExpandedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	// Hide projects section when searching and no matches
	if (searchQuery && !hasAnyMatches) {
		return null;
	}

	if (groups.length === 0) {
		return null;
	}

	return (
		<div className="mb-4">
			<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
				Projects
				{searchQuery && hasAnyMatches && (
					<span className="ml-2 text-xs bg-accent/50 px-1.5 py-0.5 rounded">
						{(matchCounts?.project ?? 0) + (matchCounts?.workspace ?? 0)}
					</span>
				)}
			</h2>
			<nav className="flex flex-col gap-0.5">
				{groups.map((group) => {
					const isProjectActive = matchRoute({
						to: "/settings/project/$projectId",
						params: { projectId: group.project.id },
					});

					return (
						<div key={group.project.id}>
							{/* Project header */}
							<div
								className={cn(
									"flex items-center h-8 rounded-md transition-colors",
									isProjectActive
										? "bg-accent text-accent-foreground"
										: "hover:bg-accent/50",
								)}
							>
								<Link
									to="/settings/project/$projectId"
									params={{ projectId: group.project.id }}
									className="flex-1 flex items-center gap-2 pl-3 pr-1 h-full text-sm text-left"
								>
									<div
										className="w-2 h-2 rounded-full shrink-0"
										style={{ backgroundColor: group.project.color }}
									/>
									<span className="flex-1 truncate font-medium">
										{group.project.name}
									</span>
								</Link>
								<button
									type="button"
									onClick={() => toggleProject(group.project.id)}
									className={cn(
										"px-2 h-full flex items-center",
										isProjectActive
											? "text-accent-foreground"
											: "text-muted-foreground",
									)}
								>
									{expandedProjects.has(group.project.id) ? (
										<HiChevronDown className="h-3.5 w-3.5" />
									) : (
										<HiChevronRight className="h-3.5 w-3.5" />
									)}
								</button>
							</div>

							{/* Workspaces */}
							{expandedProjects.has(group.project.id) && (
								<div className="ml-4 border-l border-border pl-2 mt-0.5 mb-1">
									{group.workspaces.map((workspace) => {
										const isWorkspaceActive = matchRoute({
											to: "/settings/workspace/$workspaceId",
											params: { workspaceId: workspace.id },
										});

										return (
											<Link
												key={workspace.id}
												to="/settings/workspace/$workspaceId"
												params={{ workspaceId: workspace.id }}
												className={cn(
													"flex items-center gap-2 px-2 py-1 text-sm w-full text-left rounded-md transition-colors",
													isWorkspaceActive
														? "bg-accent text-accent-foreground"
														: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
												)}
											>
												<span className="truncate">{workspace.name}</span>
											</Link>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</nav>
		</div>
	);
}
