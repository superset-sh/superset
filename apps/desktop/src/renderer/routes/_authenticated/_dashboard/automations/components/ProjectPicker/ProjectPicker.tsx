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
import { HiCheck } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface ProjectPickerProps {
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	className?: string;
}

export function ProjectPicker({
	selectedProject,
	recentProjects,
	onSelectProject,
	className,
}: ProjectPickerProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={
						selectedProject ? (
							<ProjectThumbnail
								projectName={selectedProject.name}
								iconUrl={selectedProject.iconUrl}
								className="!size-5"
							/>
						) : (
							<LuFolder className="size-5 shrink-0" />
						)
					}
					label={selectedProject?.name ?? "Select project"}
				/>
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
										iconUrl={project.iconUrl}
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
