import { Plural } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiChevronRight } from "react-icons/hi2";
import { LuEyeOff } from "react-icons/lu";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type { DashboardSidebarHiddenProject } from "../../types";

interface DashboardSidebarHiddenProjectsProps {
	projects: DashboardSidebarHiddenProject[];
	onShow: (projectId: string) => void;
}

/**
 * The way back for a hidden project: a muted row at the foot of the project
 * list, exactly where the project used to be, listing what is hidden. One
 * click on an entry puts it back with its groups and pins untouched.
 */
export function DashboardSidebarHiddenProjects({
	projects,
	onShow,
}: DashboardSidebarHiddenProjectsProps) {
	if (projects.length === 0) return null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="group mx-2 mt-1 flex h-7 w-[calc(100%-1rem)] items-center gap-2 rounded-md pl-2 pr-1 text-[13px] text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground data-[state=open]:bg-fill-hover data-[state=open]:text-foreground"
				>
					<LuEyeOff className="size-4 shrink-0" />
					<span className="min-w-0 flex-1 truncate text-left">
						<Plural
							value={projects.length}
							one="# hidden project"
							other="# hidden projects"
						/>
					</span>
					<HiChevronRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:opacity-100" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-56 max-h-80 overflow-y-auto"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				{projects.map((project) => (
					<DropdownMenuItem
						key={project.id}
						onSelect={() => onShow(project.id)}
					>
						<ProjectThumbnail
							projectName={project.name}
							iconUrl={project.iconUrl}
							color={project.color}
							className="size-4"
						/>
						<span className="truncate">{project.name}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
