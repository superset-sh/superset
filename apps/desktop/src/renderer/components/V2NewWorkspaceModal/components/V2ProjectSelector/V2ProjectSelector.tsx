import { Button } from "@superset/ui/button";
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
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { V2ProjectThumbnail } from "renderer/screens/main/components/V2WorkspaceSidebar/components/V2ProjectThumbnail";

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

	const { data: githubRepositories } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
			})),
		[collections],
	);

	const projects = useMemo(() => {
		const ownerByRepoId = new Map(
			(githubRepositories ?? []).map((repo) => [repo.id, repo.owner]),
		);

		return (v2Projects ?? []).map((project) => ({
			id: project.id,
			name: project.name,
			owner: ownerByRepoId.get(project.githubRepositoryId) ?? null,
		}));
	}, [githubRepositories, v2Projects]);

	const selectedProject = projects.find((p) => p.id === selectedProjectId);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
					{selectedProject ? (
						<V2ProjectThumbnail
							projectName={selectedProject.name}
							githubOwner={selectedProject.owner}
							className="size-4"
						/>
					) : null}
					<span className="truncate max-w-[140px]">
						{selectedProject?.name ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-60 p-0">
				<Command>
					<CommandInput placeholder="Search projects..." />
					<CommandList className="max-h-72">
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup>
							{projects.map((project) => (
								<CommandItem
									key={project.id}
									value={
										project.owner
											? `${project.owner}/${project.name}`
											: project.name
									}
									onSelect={() => {
										onSelectProject(project.id);
										setOpen(false);
									}}
								>
									<V2ProjectThumbnail
										projectName={project.name}
										githubOwner={project.owner}
									/>
									<div className="flex min-w-0 flex-col">
										<span className="truncate">{project.name}</span>
										{project.owner ? (
											<span className="truncate text-xs text-muted-foreground">
												{project.owner}
											</span>
										) : null}
									</div>
									{project.id === selectedProjectId && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
					<CommandSeparator />
					<div className="p-1">
						<Button
							variant="ghost"
							className="w-full justify-start gap-2 px-2 py-1.5 text-sm font-normal"
							onClick={() => {
								setOpen(false);
								window.open(
									`${env.NEXT_PUBLIC_WEB_URL}/integrations/github`,
									"_blank",
								);
							}}
						>
							<FaGithub className="size-4" />
							Add from GitHub
						</Button>
					</div>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
