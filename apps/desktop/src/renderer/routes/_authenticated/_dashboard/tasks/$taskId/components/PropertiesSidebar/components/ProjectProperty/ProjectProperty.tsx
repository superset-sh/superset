import type { SelectV2Project } from "@superset/db/schema";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineFolder } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";

interface ProjectPropertyProps {
	task: TaskWithStatus;
}

export function ProjectProperty({ task }: ProjectPropertyProps) {
	const collections = useCollections();
	const { tasks: taskActions } = useOptimisticCollectionActions();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: projectData } = useLiveQuery(
		(q) => (open ? q.from({ projects: collections.v2Projects }) : null),
		[collections, open],
	);

	const projects = useMemo(() => projectData ?? [], [projectData]);
	const currentProject = useMemo(
		() =>
			projects.find((project) => project.id === task.v2ProjectId) ??
			task.project,
		[projects, task.project, task.v2ProjectId],
	);
	const filteredProjects = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return projects;
		return projects.filter((project) =>
			project.name.toLowerCase().includes(query),
		);
	}, [projects, search]);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) setSearch("");
	};

	const handleSelectProject = (project: SelectV2Project | null) => {
		const projectId = project?.id ?? null;
		if (projectId === task.v2ProjectId) {
			setOpen(false);
			return;
		}

		const transaction = taskActions.updateProject(task.id, projectId);
		if (transaction) {
			setOpen(false);
			setSearch("");
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">Project</span>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
					>
						{currentProject ? (
							<ProjectThumbnail
								projectName={currentProject.name}
								iconUrl={currentProject.iconUrl}
								className="size-4 rounded-[3px]"
							/>
						) : (
							<HiOutlineFolder className="size-4 text-muted-foreground" />
						)}
						<span className="min-w-0 flex-1 truncate text-sm">
							{currentProject?.name ?? "No project"}
						</span>
						<HiChevronDown className="size-3.5 text-muted-foreground" />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-60 p-0">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Search projects..."
							value={search}
							onValueChange={setSearch}
						/>
						<CommandList className="max-h-72">
							<CommandGroup>
								<CommandItem onSelect={() => handleSelectProject(null)}>
									<HiOutlineFolder className="size-4" />
									<span className="flex-1 text-sm">No project</span>
									{task.v2ProjectId === null && (
										<HiCheck className="size-3.5" />
									)}
								</CommandItem>
							</CommandGroup>

							{filteredProjects.length === 0 ? (
								<CommandEmpty>No projects found.</CommandEmpty>
							) : (
								<CommandGroup>
									{filteredProjects.map((project) => (
										<CommandItem
											key={project.id}
											onSelect={() => handleSelectProject(project)}
										>
											<ProjectThumbnail
												projectName={project.name}
												iconUrl={project.iconUrl}
												className="size-4 shrink-0 rounded-[3px]"
											/>
											<span className="flex-1 truncate text-sm">
												{project.name}
											</span>
											{project.id === task.v2ProjectId && (
												<HiCheck className="size-3.5" />
											)}
										</CommandItem>
									))}
								</CommandGroup>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
