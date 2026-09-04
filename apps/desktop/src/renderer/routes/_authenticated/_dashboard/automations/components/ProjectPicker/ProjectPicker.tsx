import { Trans, useLingui } from "@lingui/react/macro";
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
import { LuBox, LuFolder } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import type { ProjectOption } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface ProjectPickerProps {
	selectedProject: ProjectOption | undefined;
	/** True when "No project" (session mode) is the explicit selection. */
	sessionSelected?: boolean;
	recentProjects: ProjectOption[];
	/** Null = session mode: runs use project-less session workspaces. */
	onSelectProject: (projectId: string | null) => void;
	className?: string;
	disabled?: boolean;
}

export function ProjectPicker({
	selectedProject,
	sessionSelected = false,
	recentProjects,
	onSelectProject,
	className,
	disabled,
}: ProjectPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	return (
		// Guard the open state, not just the trigger: Radix opens on pointerdown,
		// which Chromium still dispatches to fieldset-disabled buttons.
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<PopoverTrigger asChild>
				<PickerTrigger
					disabled={disabled}
					className={className}
					icon={
						selectedProject ? (
							<ProjectThumbnail
								projectName={selectedProject.name}
								iconUrl={selectedProject.iconUrl}
								className="!size-5"
							/>
						) : sessionSelected ? (
							<LuBox className="size-5 shrink-0" />
						) : (
							<LuFolder className="size-5 shrink-0" />
						)
					}
					label={
						selectedProject?.name ??
						(sessionSelected
							? t({
									message: "No project",
								})
							: t({
									message: "Select project",
								}))
					}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command>
					<CommandInput
						placeholder={t({
							message: "Search projects...",
						})}
					/>
					<CommandList>
						<CommandEmpty>
							<Trans>No projects found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem
								value="No project session"
								onSelect={() => {
									onSelectProject(null);
									setOpen(false);
								}}
							>
								<LuBox className="size-4 shrink-0" />
								<Trans>
									No project
									<span className="ml-1 text-muted-foreground">session</span>
								</Trans>
								{sessionSelected && <HiCheck className="ml-auto size-4" />}
							</CommandItem>
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
