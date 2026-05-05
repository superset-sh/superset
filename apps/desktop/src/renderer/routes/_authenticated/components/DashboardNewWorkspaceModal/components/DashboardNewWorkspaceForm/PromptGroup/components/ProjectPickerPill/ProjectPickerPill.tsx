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
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiCheck, HiChevronUpDown, HiMiniPlus } from "react-icons/hi2";
import { LuFolderInput, LuTriangleAlert } from "react-icons/lu";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useOpenNewProjectModal } from "renderer/stores/add-repository-modal";
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
	const openNewProject = useOpenNewProjectModal();
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error("Import failed", {
				description: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
				action: {
					label: "Open Projects",
					onClick: () => navigate({ to: "/settings/projects" }),
				},
			});
		},
	});

	const handleCreateNewProject = async () => {
		setOpen(false);
		const result = await openNewProject();
		if (result) onSelectProject(result.projectId);
	};

	const handleImportProject = async () => {
		setOpen(false);
		const result = await folderImport.start();
		if (result) {
			toast.success("Project imported and selected.");
			onSelectProject(result.projectId);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-[140px]">
					{selectedProject && (
						<ProjectThumbnail
							projectName={selectedProject.name}
							iconUrl={selectedProject.iconUrl}
							className="size-4"
						/>
					)}
					<span className="truncate">
						{selectedProject?.name ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-60 p-0"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList className="max-h-[min(280px,var(--radix-popover-content-available-height))]">
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
										iconUrl={project.iconUrl}
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
					<CommandSeparator alwaysRender />
					<CommandGroup forceMount>
						<CommandItem forceMount onSelect={handleCreateNewProject}>
							<HiMiniPlus className="size-4" />
							Create new project
						</CommandItem>
						<CommandItem forceMount onSelect={handleImportProject}>
							<LuFolderInput className="size-4" />
							Import project
						</CommandItem>
					</CommandGroup>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
