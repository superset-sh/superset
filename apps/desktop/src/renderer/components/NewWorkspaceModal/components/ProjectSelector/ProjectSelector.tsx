import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuFolderGit, LuFolderOpen } from "react-icons/lu";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";

interface ProjectOption {
	id: string;
	name: string;
	color: string;
	githubOwner: string | null;
	iconUrl: string | null;
	hideImage: boolean | null;
}

interface ProjectSelectorProps {
	selectedProjectId: string | null;
	selectedProjectName: string | null;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onImportRepo: () => void;
	onNewProject: () => void;
}

export function ProjectSelector({
	selectedProjectId,
	selectedProjectName,
	recentProjects,
	onSelectProject,
	onImportRepo,
	onNewProject,
}: ProjectSelectorProps) {
	const [open, setOpen] = useState(false);

	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm">
					{selectedProject && (
						<ProjectThumbnail
							projectId={selectedProject.id}
							projectName={selectedProject.name}
							projectColor={selectedProject.color}
							githubOwner={selectedProject.githubOwner}
							iconUrl={selectedProject.iconUrl}
							hideImage={selectedProject.hideImage ?? false}
						/>
					)}
					<span className="truncate max-w-[140px]">
						{selectedProjectName ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 p-0">
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList>
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup>
							{recentProjects.map((project) => (
								<CommandItem
									key={project.id}
									value={project.name}
									onSelect={() => {
										onSelectProject(project.id);
										setOpen(false);
									}}
								>
									<ProjectThumbnail
										projectId={project.id}
										projectName={project.name}
										projectColor={project.color}
										githubOwner={project.githubOwner}
										iconUrl={project.iconUrl}
										hideImage={project.hideImage ?? false}
									/>
									{project.name}
									{project.id === selectedProjectId && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
						<CommandSeparator alwaysRender />
						<CommandGroup forceMount>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onImportRepo();
								}}
							>
								<LuFolderOpen className="size-4" />
								Open project
							</CommandItem>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onNewProject();
								}}
							>
								<LuFolderGit className="size-4" />
								New project
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
