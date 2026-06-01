import { Button } from "@superset/ui/button";
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
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isProjectlessTaskFilter,
	PROJECTLESS_TASKS_FILTER,
} from "../../../../../../stores/tasks-filter-state";

interface ProjectFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
	includeTaskOptions?: boolean;
}

export function ProjectFilter({
	value,
	onChange,
	includeTaskOptions = false,
}: ProjectFilterProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: allProjects } = useLiveQuery(
		(q) => q.from({ projects: collections.v2Projects }),
		[collections],
	);

	const projects = useMemo(() => allProjects ?? [], [allProjects]);

	const selected = useMemo(
		() => (value ? (projects.find((p) => p.id === value) ?? null) : null),
		[value, projects],
	);
	const isProjectless = isProjectlessTaskFilter(value);
	const triggerLabel = selected
		? selected.name
		: isProjectless
			? "No project"
			: includeTaskOptions
				? "All tasks"
				: "Project";

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return projects;
		return projects.filter((p) => p.name.toLowerCase().includes(q));
	}, [projects, search]);

	const handleSelect = (id: string | null) => {
		onChange(id);
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={triggerLabel}
					aria-label={triggerLabel}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selected ? (
						<ProjectThumbnail
							projectName={selected.name}
							iconUrl={selected.iconUrl}
							className="size-4 rounded-[3px]"
						/>
					) : (
						<HiOutlineFolder className="size-4" />
					)}
					<span className="text-sm hidden @4xl:inline">{triggerLabel}</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search projects..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-80">
						{filtered.length === 0 && search && (
							<CommandEmpty>No projects found.</CommandEmpty>
						)}
						{includeTaskOptions && (
							<CommandGroup>
								<CommandItem onSelect={() => handleSelect(null)}>
									<HiOutlineFolder className="size-4 shrink-0 text-muted-foreground" />
									<span className="text-sm truncate">All tasks</span>
									{value === null && (
										<HiCheck className="ml-auto size-3.5 shrink-0" />
									)}
								</CommandItem>
								<CommandItem
									onSelect={() => handleSelect(PROJECTLESS_TASKS_FILTER)}
								>
									<HiOutlineFolder className="size-4 shrink-0 text-muted-foreground" />
									<span className="text-sm truncate">No project</span>
									{isProjectless && (
										<HiCheck className="ml-auto size-3.5 shrink-0" />
									)}
								</CommandItem>
							</CommandGroup>
						)}
						{filtered.length > 0 && (
							<CommandGroup>
								{filtered.map((project) => (
									<CommandItem
										key={project.id}
										onSelect={() => handleSelect(project.id)}
									>
										<ProjectThumbnail
											projectName={project.name}
											iconUrl={project.iconUrl}
											className="size-4 shrink-0 rounded-[3px]"
										/>
										<span className="text-sm truncate">{project.name}</span>
										{project.id === value && (
											<HiCheck className="ml-auto size-3.5 shrink-0" />
										)}
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
