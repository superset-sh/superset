import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { HiMiniPlus } from "react-icons/hi2";
import { LuFolderGit2, LuSearchX } from "react-icons/lu";
import { V2ProjectRow } from "renderer/routes/_authenticated/_dashboard/v2-projects/components/V2ProjectRow";
import type { AccessibleV2Project } from "renderer/routes/_authenticated/_dashboard/v2-projects/hooks/useAccessibleV2Projects";
import { useV2ProjectsFilterStore } from "renderer/routes/_authenticated/_dashboard/v2-projects/stores/v2ProjectsFilterStore";
import { useOpenNewProjectModal } from "renderer/stores/add-repository-modal";

interface V2ProjectsListProps {
	projects: AccessibleV2Project[];
}

export function V2ProjectsList({ projects }: V2ProjectsListProps) {
	const searchQuery = useV2ProjectsFilterStore((state) => state.searchQuery);
	const resetFilters = useV2ProjectsFilterStore((state) => state.reset);
	const openNewProject = useOpenNewProjectModal();

	const hasActiveFilters = searchQuery.trim() !== "";

	if (projects.length === 0) {
		return (
			<Empty className="flex-1 border-0">
				<EmptyHeader>
					<EmptyMedia
						variant="icon"
						className="size-14 [&_svg:not([class*='size-'])]:size-7"
					>
						{hasActiveFilters ? <LuSearchX /> : <LuFolderGit2 />}
					</EmptyMedia>
					<EmptyTitle>
						{hasActiveFilters
							? "No projects match your search"
							: "No projects yet"}
					</EmptyTitle>
					<EmptyDescription>
						{hasActiveFilters
							? "Try a different search term."
							: "Create a project to start tracking workspaces and repositories here."}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{hasActiveFilters ? (
						<Button variant="outline" size="sm" onClick={() => resetFilters()}>
							Clear search
						</Button>
					) : (
						<Button size="sm" onClick={openNewProject} className="gap-1.5">
							<HiMiniPlus className="size-4" />
							New project
						</Button>
					)}
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			{/* Column headers */}
			<div className="flex items-center border-b border-border/50 bg-card/95 text-xs font-medium text-muted-foreground">
				<div className="flex-1 px-4 py-2">Name</div>
				<div className="hidden w-56 px-3 py-2 md:block">Repository</div>
				<div className="w-28 px-3 py-2">Workspaces</div>
				<div className="w-32 px-3 py-2">Updated</div>
				<div className="w-12" />
			</div>

			{/* Rows */}
			<div className="flex-1 overflow-y-auto">
				{projects.map((project) => (
					<V2ProjectRow key={project.id} project={project} />
				))}
			</div>
		</div>
	);
}
