import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { useMemo } from "react";
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

	const matchCounts = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchCountBySection(searchQuery);
	}, [searchQuery]);

	const hasProjectMatches = (matchCounts?.project ?? 0) > 0;

	if (searchQuery && !hasProjectMatches) {
		return null;
	}

	if (groups.length === 0) {
		return null;
	}

	return (
		<div className="mb-4">
			<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
				Projects
				{searchQuery && hasProjectMatches && (
					<span className="ml-2 text-xs bg-accent/50 px-1.5 py-0.5 rounded">
						{matchCounts?.project ?? 0}
					</span>
				)}
			</h2>
			<nav className="flex flex-col gap-0.5">
				{groups.map((group) => {
					const isGeneralActive = matchRoute({
						to: "/settings/project/$projectId/general",
						params: { projectId: group.project.id },
					});
					const isSecretsActive = matchRoute({
						to: "/settings/project/$projectId/secrets",
						params: { projectId: group.project.id },
					});
					const isProjectActive = !!isGeneralActive || !!isSecretsActive;

					return (
						<Collapsible key={group.project.id} defaultOpen>
							{/* Project header — expand/collapse only, no navigation */}
							<CollapsibleTrigger
								className={cn(
									"group flex items-center gap-2 w-full h-8 px-3 rounded-md transition-colors text-sm text-left font-medium",
									isProjectActive
										? "bg-accent text-accent-foreground"
										: "hover:bg-accent/50",
								)}
							>
								<div
									className="w-2 h-2 rounded-full shrink-0"
									style={{ backgroundColor: group.project.color }}
								/>
								<span className="flex-1 truncate">{group.project.name}</span>
								<HiChevronRight className="h-3.5 w-3.5 text-muted-foreground group-data-[state=open]:hidden" />
								<HiChevronDown className="h-3.5 w-3.5 text-muted-foreground group-data-[state=closed]:hidden" />
							</CollapsibleTrigger>

							{/* Sub-items: General + Env Variables */}
							<CollapsibleContent>
								<div className="ml-4 border-l border-border pl-2 mt-0.5 mb-1">
									<Link
										to="/settings/project/$projectId/general"
										params={{ projectId: group.project.id }}
										className={cn(
											"flex items-center gap-2 px-2 py-1 text-sm w-full text-left rounded-md transition-colors",
											isGeneralActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
										)}
									>
										<span className="truncate">General</span>
									</Link>
									<Link
										to="/settings/project/$projectId/secrets"
										params={{ projectId: group.project.id }}
										className={cn(
											"flex items-center gap-2 px-2 py-1 text-sm w-full text-left rounded-md transition-colors",
											isSecretsActive
												? "bg-accent text-accent-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
										)}
									>
										<span className="truncate">Environment Variables</span>
									</Link>
								</div>
							</CollapsibleContent>
						</Collapsible>
					);
				})}
			</nav>
		</div>
	);
}
