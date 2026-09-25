import { plural } from "@lingui/core/macro";
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
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import {
	HiCheck,
	HiChevronDown,
	HiOutlineFolder,
	HiOutlineSquares2X2,
} from "react-icons/hi2";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface ProjectFilterProps {
	value: string[];
	onChange: (value: string[]) => void;
	/** Shows the label text regardless of container width — the default
	 *  `@4xl:inline` gating assumes a wide inline toolbar row, which doesn't
	 *  apply inside a narrow popover. */
	alwaysShowLabel?: boolean;
}

export function ProjectFilter({
	value,
	onChange,
	alwaysShowLabel,
}: ProjectFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	// Projects are fully local — identity comes from the host fan-out.
	const { projects: hostProjects, isReady } = useHostProjects();
	const projects = useMemo(
		() =>
			hostProjects.map((project) => ({
				id: project.projectKey,
				name: project.name,
				iconUrl: resolveProjectIconUrl(project),
			})),
		[hostProjects],
	);

	const selectedProjects = useMemo(
		() => projects.filter((project) => value.includes(project.id)),
		[value, projects],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return projects;
		return projects.filter((p) => p.name.toLowerCase().includes(q));
	}, [projects, search]);

	const handleSelect = (id: string) => {
		onChange(
			value.includes(id)
				? value.filter((projectId) => projectId !== id)
				: [...value, id],
		);
	};
	const isAllSelected = value.length === 0;
	const isLoadingWithoutProjects = !isReady && projects.length === 0;
	const label = isLoadingWithoutProjects
		? t({
				message: "Loading repositories",
			})
		: isAllSelected
			? t({
					message: "All repositories",
				})
			: selectedProjects.length === 1
				? selectedProjects[0]?.name
				: t({
						message: plural(selectedProjects.length, {
							one: "# repository",
							other: "# repositories",
						}),
					});
	const selectedProject =
		selectedProjects.length === 1 ? selectedProjects[0] : null;

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
					title={label}
					aria-label={t({
						message: `Repositories: ${label}`,
					})}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selectedProject ? (
						<ProjectThumbnail
							projectName={selectedProject.name}
							iconUrl={selectedProject.iconUrl}
							className="size-4 rounded-[3px]"
						/>
					) : isAllSelected ? (
						<HiOutlineSquares2X2 className="size-4" />
					) : (
						<HiOutlineFolder className="size-4" />
					)}
					<span
						className={cn(
							"max-w-32 truncate text-sm @6xl:max-w-48",
							alwaysShowLabel ? "inline" : "hidden @4xl:inline",
						)}
					>
						{label}
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
						{filtered.length === 0 && (
							<CommandEmpty>
								{isReady || projects.length > 0 ? (
									search ? (
										<Trans>No projects found.</Trans>
									) : (
										<Trans>No projects available.</Trans>
									)
								) : (
									<Trans>Loading projects…</Trans>
								)}
							</CommandEmpty>
						)}
						{filtered.length > 0 && (
							<CommandGroup>
								{!search && (
									<CommandItem onSelect={() => onChange([])}>
										<HiOutlineSquares2X2 className="size-4 shrink-0" />
										<span className="text-sm">
											<Trans>All repositories</Trans>
										</span>
										{isAllSelected && (
											<HiCheck className="ml-auto size-3.5 shrink-0" />
										)}
									</CommandItem>
								)}
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
										{value.includes(project.id) && (
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
