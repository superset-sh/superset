import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuTriangleAlert } from "react-icons/lu";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import type { ProjectOption } from "../../types";
import { FormPickerTrigger } from "../FormPickerTrigger";

interface ProjectPickerPillProps {
	selectedProject: ProjectOption | undefined;
	projects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
}

export function ProjectPickerPill({
	selectedProject,
	projects,
	onSelectProject,
}: ProjectPickerPillProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-[140px]">
					{selectedProject && (
						<ProjectThumbnail
							projectName={selectedProject.name}
							githubOwner={selectedProject.githubOwner}
							className="size-4"
						/>
					)}
					<span className="truncate">
						{selectedProject?.name ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList>
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup>
							{projects.map((project) => (
								<CommandItem
									key={project.id}
									value={project.name}
									onSelect={() => {
										onSelectProject(project.id);
										setOpen(false);
									}}
								>
									<ProjectThumbnail
										projectName={project.name}
										githubOwner={project.githubOwner}
									/>
									<span className="flex-1 truncate">{project.name}</span>
									{project.needsSetup === true && (
										<Tooltip>
											<TooltipTrigger asChild>
												<LuTriangleAlert className="size-3.5 shrink-0 text-amber-500" />
											</TooltipTrigger>
											<TooltipContent>Not set up on this host</TooltipContent>
										</Tooltip>
									)}
									{project.id === selectedProject?.id && (
										<HiCheck className="size-4 shrink-0" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
