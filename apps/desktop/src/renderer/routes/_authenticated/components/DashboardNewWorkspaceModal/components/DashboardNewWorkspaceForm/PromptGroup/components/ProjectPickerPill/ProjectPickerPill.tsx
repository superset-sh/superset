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
import { LuArrowRight } from "react-icons/lu";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { FORM_PICKER_TRIGGER_CLASS, type ProjectOption } from "../../types";

interface ProjectPickerPillProps {
	selectedProject: ProjectOption | undefined;
	/** Projects set up on the currently-selected host — picking one here
	 * goes straight to the normal flow (branch picker, etc.). */
	availableProjects: ProjectOption[];
	/** Projects the user has cloud access to but which aren't set up on
	 * the selected host yet — picking one opens the Pin & set up modal
	 * instead of selecting the project directly. */
	needSetupProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onSetupProject: (project: ProjectOption) => void;
}

export function ProjectPickerPill({
	selectedProject,
	availableProjects,
	needSetupProjects,
	onSelectProject,
	onSetupProject,
}: ProjectPickerPillProps) {
	const [open, setOpen] = useState(false);

	const hasAvailable = availableProjects.length > 0;
	const hasNeedSetup = needSetupProjects.length > 0;

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
						{hasAvailable && (
							<CommandGroup heading="Available">
								{availableProjects.map((project) => (
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
						)}
						{hasNeedSetup && (
							<CommandGroup heading="Needs setup">
								{needSetupProjects.map((project) => (
									<CommandItem
										key={project.id}
										value={project.name}
										onSelect={() => {
											onSetupProject(project);
											setOpen(false);
										}}
										className="group"
									>
										<ProjectThumbnail
											projectName={project.name}
											githubOwner={project.githubOwner}
										/>
										<span className="truncate">{project.name}</span>
										<span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground group-data-[selected=true]:text-foreground">
											Set up
											<LuArrowRight className="size-3" />
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
