import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const openEmptyProject = useOpenEmptyProjectModal();
	const openNewProject = useOpenNewProjectModal();
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(
				t({
					message: `Import failed: ${message}`,
				}),
			);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error(
				t({
					message: "Import failed",
				}),
				{
					description: t({
						message: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
					}),
					action: {
						label: t({
							message: "Open Projects",
						}),
						onClick: () => navigate({ to: "/settings/projects" }),
					},
				},
			);
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
			toast.success(
				t({
					message: "Project imported and selected.",
				}),
			);
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
							(isSessionSelected
								? t({
										message: "No project",
									})
								: t({
										message: "Select project",
									}))}
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
					<CommandInput
						placeholder={t({
							message: "Search projects...",
						})}
					/>
					<CommandList className="max-h-[min(280px,var(--radix-popover-content-available-height))]">
						<CommandEmpty>
							<Trans>No projects found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value="no-project-session"
								onSelect={() => {
									onSelectProject(null);
									setOpen(false);
								}}
							>
								<LuBox className="size-4 text-muted-foreground" />
								<span className="flex-1 truncate">
									<Trans>No project</Trans>
								</span>
								<span className="text-[10px] text-muted-foreground">
									<Trans>Session</Trans>
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
									{project.needsSetup === true && (
										<Tooltip>
											<TooltipTrigger asChild>
												<LuTriangleAlert className="size-3.5 shrink-0 text-amber-500" />
											</TooltipTrigger>
											<TooltipContent>
												<Trans>Not set up on this host</Trans>
											</TooltipContent>
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
							<LuFolderPlus className="size-4" />
							<Trans>Create new project</Trans>
						</CommandItem>
						<CommandItem forceMount onSelect={handleCloneProject}>
							<HiMiniPlus className="size-4" />
							<Trans>Clone from URL</Trans>
						</CommandItem>
						<CommandItem forceMount onSelect={handleImportProject}>
							<LuFolderInput className="size-4" />
							<Trans>Open from folder</Trans>
						</CommandItem>
					</CommandGroup>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
