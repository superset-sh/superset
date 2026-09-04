import { Trans, useLingui } from "@lingui/react/macro";
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
import { useMemo, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineFolder } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { TASK_PICKER_INPUT } from "../../../../hooks/useTasksData";

interface LinearProjectFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

interface LinearProjectOption {
	id: string;
	name: string;
}

export function LinearProjectFilter({
	value,
	onChange,
}: LinearProjectFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: taskPage } =
		cloudTrpc.task.listPage.useQuery(TASK_PICKER_INPUT);

	const projects = useMemo(() => {
		const byId = new Map<string, LinearProjectOption>();
		for (const { task } of taskPage?.items ?? []) {
			if (!task.externalProjectId) continue;
			byId.set(task.externalProjectId, {
				id: task.externalProjectId,
				name: task.externalProjectName ?? task.externalProjectId,
			});
		}
		return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
	}, [taskPage]);

	const selected = useMemo(
		() => (value ? (projects.find((p) => p.id === value) ?? null) : null),
		[value, projects],
	);

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
					title={
						selected
							? selected.name
							: t({
									message: "Project",
								})
					}
					aria-label={
						selected
							? selected.name
							: t({
									message: "Project",
								})
					}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<HiOutlineFolder className="size-4" />
					<span className="text-sm hidden @4xl:inline">
						{selected ? selected.name : <Trans>Project</Trans>}
					</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({
							message: "Search projects...",
						})}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-80">
						{filtered.length === 0 && search && (
							<CommandEmpty>
								<Trans>No projects found.</Trans>
							</CommandEmpty>
						)}
						<CommandGroup>
							{!search && (
								<CommandItem onSelect={() => handleSelect(null)}>
									<HiOutlineFolder className="size-4 shrink-0" />
									<span className="text-sm truncate">
										<Trans>All projects</Trans>
									</span>
									{value === null && (
										<HiCheck className="ml-auto size-3.5 shrink-0" />
									)}
								</CommandItem>
							)}
							{filtered.map((project) => (
								<CommandItem
									key={project.id}
									onSelect={() => handleSelect(project.id)}
								>
									<HiOutlineFolder className="size-4 shrink-0" />
									<span className="text-sm truncate">{project.name}</span>
									{project.id === value && (
										<HiCheck className="ml-auto size-3.5 shrink-0" />
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
