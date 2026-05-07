import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { HiMiniPlus } from "react-icons/hi2";
import { LuSearch } from "react-icons/lu";
import { useV2ProjectsFilterStore } from "renderer/routes/_authenticated/_dashboard/v2-projects/stores/v2ProjectsFilterStore";
import { useOpenNewProjectModal } from "renderer/stores/add-repository-modal";

interface V2ProjectsHeaderProps {
	totalCount: number;
}

export function V2ProjectsHeader({ totalCount }: V2ProjectsHeaderProps) {
	const searchQuery = useV2ProjectsFilterStore((state) => state.searchQuery);
	const setSearchQuery = useV2ProjectsFilterStore(
		(state) => state.setSearchQuery,
	);
	const openNewProject = useOpenNewProjectModal();

	return (
		<div className="flex items-center gap-3 border-b border-border/50 px-4 py-2">
			<div className="flex items-center gap-2">
				<h1 className="text-sm font-semibold">Projects</h1>
				<span className="text-xs text-muted-foreground">{totalCount}</span>
			</div>

			<div className="relative flex-1">
				<LuSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/50" />
				<Input
					type="search"
					placeholder="Search projects..."
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					className="h-8 bg-background/50 pl-9"
				/>
			</div>

			<Button size="sm" onClick={openNewProject} className="h-8 gap-1.5">
				<HiMiniPlus className="size-4" />
				New project
			</Button>
		</div>
	);
}
