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
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface V2ProjectSelectorProps {
	selectedProjectId: string | null;
	onSelectProject: (projectId: string) => void;
}

export function V2ProjectSelector({
	selectedProjectId,
	onSelectProject,
}: V2ProjectSelectorProps) {
	const [open, setOpen] = useState(false);
	const collections = useCollections();

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.select(({ projects }) => ({ ...projects })),
		[collections],
	);

	const projects = useMemo(() => v2Projects ?? [], [v2Projects]);

	const selectedProject = projects.find((p) => p.id === selectedProjectId);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
					<span className="truncate max-w-[140px]">
						{selectedProject?.name ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 p-0">
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList>
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
									{project.name}
									{project.id === selectedProjectId && (
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
