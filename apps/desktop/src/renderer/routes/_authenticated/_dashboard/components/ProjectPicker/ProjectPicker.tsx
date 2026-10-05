import { Trans } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ProjectCommand } from "renderer/routes/_authenticated/_dashboard/components/ProjectCommand";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";

interface ProjectOption {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
}

interface ProjectPickerProps {
	project: ProjectOption | null;
	projects: ProjectOption[];
	onSetProject: (projectId: string | null) => void;
	onCreateProject: (name: string) => void;
}

export function ProjectPicker({
	project,
	projects,
	onSetProject,
	onCreateProject,
}: ProjectPickerProps) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none"
				>
					{project ? (
						<>
							<TaskProjectIcon icon={project.icon} color={project.color} />
							{project.name}
						</>
					) : (
						<>
							<LuPlus className="size-3.5 text-muted-foreground" />
							<Trans>Add to project</Trans>
						</>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<ProjectCommand
					projectId={project?.id ?? null}
					projects={projects}
					onSelect={(projectId) => {
						onSetProject(projectId);
						setOpen(false);
					}}
					onCreate={(name) => {
						onCreateProject(name);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
