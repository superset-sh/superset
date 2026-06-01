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
import { useMemo, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineFolder } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface CreateTaskProjectPickerProps {
	projects: SelectV2Project[];
	value: string | null;
	onChange: (value: string | null) => void;
}

export function CreateTaskProjectPicker({
	projects,
	value,
	onChange,
}: CreateTaskProjectPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const selectedProject = useMemo(
		() => projects.find((project) => project.id === value) ?? null,
		[projects, value],
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

	const handleSelect = (nextValue: string | null) => {
		onChange(nextValue);
		setOpen(false);
		setSearch("");
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex h-9 items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 text-sm transition-colors hover:bg-muted/60"
				>
					{selectedProject ? (
						<>
							<ProjectThumbnail
								projectName={selectedProject.name}
								iconUrl={selectedProject.iconUrl}
								className="size-4 rounded-[3px]"
							/>
							<span className="max-w-36 truncate">{selectedProject.name}</span>
						</>
					) : (
						<>
							<HiOutlineFolder className="size-4 text-muted-foreground" />
							<span className="text-muted-foreground">No project</span>
						</>
					)}
					<HiChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search projects..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-72">
						<CommandGroup>
							<CommandItem onSelect={() => handleSelect(null)}>
								<HiOutlineFolder className="size-4" />
								<span className="flex-1 text-sm">No project</span>
								{value === null && <HiCheck className="size-3.5" />}
							</CommandItem>
						</CommandGroup>

						{filteredProjects.length === 0 ? (
							<CommandEmpty>No projects found.</CommandEmpty>
						) : (
							<CommandGroup>
								{filteredProjects.map((project) => (
									<CommandItem
										key={project.id}
										onSelect={() => handleSelect(project.id)}
									>
										<ProjectThumbnail
											projectName={project.name}
											iconUrl={project.iconUrl}
											className="size-4 shrink-0 rounded-[3px]"
										/>
										<span className="flex-1 truncate text-sm">
											{project.name}
										</span>
										{project.id === value && <HiCheck className="size-3.5" />}
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
