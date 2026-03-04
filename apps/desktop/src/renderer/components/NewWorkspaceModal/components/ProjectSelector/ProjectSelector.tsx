import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiCheck, HiChevronDown } from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";

interface ProjectOption {
	id: string;
	name: string;
}

interface ProjectSelectorProps {
	selectedProjectId: string | null;
	selectedProjectName: string | null;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onImportRepo: () => void;
	className?: string;
}

export function ProjectSelector({
	selectedProjectId,
	selectedProjectName,
	recentProjects,
	onSelectProject,
	onImportRepo,
	className,
}: ProjectSelectorProps) {
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							className={`w-full h-8 text-sm justify-between font-normal min-w-0 ${className ?? ""}`}
						>
							<span
								className={`truncate ${
									selectedProjectName ? "" : "text-muted-foreground"
								}`}
							>
								{selectedProjectName ?? "Select project"}
							</span>
							<HiChevronDown className="size-4 text-muted-foreground shrink-0" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Project the workspace belongs to
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="start"
				className="w-[--radix-dropdown-menu-trigger-width]"
			>
				{recentProjects.map((project) => (
					<DropdownMenuItem
						key={project.id}
						onClick={() => onSelectProject(project.id)}
					>
						{project.name}
						{project.id === selectedProjectId && (
							<HiCheck className="ml-auto size-4" />
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={onImportRepo}>
					<LuFolderOpen className="size-4" />
					Import repo
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
