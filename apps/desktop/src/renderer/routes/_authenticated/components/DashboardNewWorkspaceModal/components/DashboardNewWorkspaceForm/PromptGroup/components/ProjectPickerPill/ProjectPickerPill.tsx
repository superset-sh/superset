import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { FORM_PICKER_TRIGGER_CLASS, type ProjectOption } from "../../types";

interface ProjectPickerPillProps {
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
}

export function ProjectPickerPill({
	selectedProject,
	recentProjects,
	onSelectProject,
}: ProjectPickerPillProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={`${FORM_PICKER_TRIGGER_CLASS} max-w-[140px]`}
				>
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
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
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
										projectName={project.name}
										githubOwner={project.githubOwner}
									/>
									{project.name}
									{project.id === selectedProject?.id && (
										<HiCheck className="ml-auto size-4" />
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
