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
import {
	LuBox,
	LuFolderDown,
	LuFolderInput,
	LuFolderPlus,
	LuTriangleAlert,
} from "react-icons/lu";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import {
	useOpenEmptyProjectModal,
	useOpenNewProjectModal,
} from "renderer/stores/add-repository-modal";
import type { ProjectOption } from "../../types";
import { FormPickerTrigger } from "../FormPickerTrigger";

interface ProjectPickerPillProps {
	selectedProject: ProjectOption | undefined;
	projects: ProjectOption[];
	/** True when "No project" (session) is the explicit selection. */
	isSessionSelected?: boolean;
	/** Null selects "No project" (session). */
	onSelectProject: (projectId: string | null) => void;
}

export function ProjectPickerPill({
	selectedProject,
	projects,
	isSessionSelected = false,
	onSelectProject,
}: ProjectPickerPillProps) {
	const [open, setOpen] = useState(false);
	const openEmptyProject = useOpenEmptyProjectModal();
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
		const result = await openEmptyProject();
		if (result) onSelectProject(result.projectId);
	};

	const handleCloneProject = async () => {
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
					{isSessionSelected && !selectedProject && (
						<LuBox className="size-4 shrink-0 text-muted-foreground" />
					)}
					<span className="truncate">
						{selectedProject?.name ??
							(isSessionSelected ? "No project" : "Select project")}
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
							<CommandItem
								value="no-project-session"
								onSelect={() => {
									onSelectProject(null);
									setOpen(false);
								}}
							>
								<LuBox className="size-4 text-muted-foreground" />
								<span className="flex-1 truncate">No project</span>
								<span className="text-[10px] text-muted-foreground">
									Session
								</span>
								{isSessionSelected && <HiCheck className="size-4 shrink-0" />}
							</CommandItem>
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
									{project.needsSetup === true &&
										(project.repoUrl ? (
											// Creation subsumes setup: picking this clones it to the
											// selected host as the first step of the create.
											<Tooltip>
												<TooltipTrigger asChild>
													<LuFolderDown className="size-3.5 shrink-0 text-muted-foreground" />
												</TooltipTrigger>
												<TooltipContent>
													Will be cloned to this host
												</TooltipContent>
											</Tooltip>
										) : (
											// No remote to clone from: only reachable through the
											// settings setup modal (import from a path).
											<Tooltip>
												<TooltipTrigger asChild>
													<LuTriangleAlert className="size-3.5 shrink-0 text-amber-500" />
												</TooltipTrigger>
												<TooltipContent>
													Not on this host and has no remote to clone from
												</TooltipContent>
											</Tooltip>
										))}
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
							<LuFolderPlus className="size-4" />
							Create new project
						</CommandItem>
						<CommandItem forceMount onSelect={handleCloneProject}>
							<HiMiniPlus className="size-4" />
							Clone from URL
						</CommandItem>
						<CommandItem forceMount onSelect={handleImportProject}>
							<LuFolderInput className="size-4" />
							Open from folder
						</CommandItem>
					</CommandGroup>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
