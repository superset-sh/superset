import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { LuFolderPlus, LuPlus } from "react-icons/lu";
import { SiGithub } from "react-icons/si";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface V2SidebarFooterProps {
	isCollapsed?: boolean;
}

export function V2SidebarFooter({ isCollapsed = false }: V2SidebarFooterProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const collections = useCollections();

	const { data: repos } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				fullName: repos.fullName,
				name: repos.name,
			})),
		[collections],
	);

	const { data: existingProjects } = useLiveQuery(
		(q) =>
			q.from({ projects: collections.v2Projects }).select(({ projects }) => ({
				githubRepositoryId: projects.githubRepositoryId,
			})),
		[collections],
	);

	const usedRepoIds = useMemo(
		() =>
			new Set(
				(existingProjects ?? [])
					.map((p) => p.githubRepositoryId)
					.filter(Boolean),
			),
		[existingProjects],
	);

	const availableRepos = useMemo(
		() => (repos ?? []).filter((r) => !usedRepoIds.has(r.id)),
		[repos, usedRepoIds],
	);

	const handleSelectRepo = async (repoId: string, repoName: string) => {
		const slug =
			repoName
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "") || "project";

		setIsCreating(true);
		try {
			await apiTrpcClient.v2Project.create.mutate({
				name: repoName,
				slug,
				githubRepositoryId: repoId,
			});
			toast.success(`Project "${repoName}" created`);
			setIsOpen(false);
		} catch (error) {
			toast.error("Failed to create project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsCreating(false);
		}
	};

	if (isCollapsed) {
		return (
			<div className="border-t border-border p-2 flex flex-col items-center">
				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-foreground"
								>
									<LuFolderPlus className="size-4" strokeWidth={1.5} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add project</TooltipContent>
					</Tooltip>
					<DropdownMenuContent side="top" align="start">
						<DropdownMenuItem onClick={() => setIsOpen(true)}>
							<SiGithub className="size-4" />
							From GitHub repository
						</DropdownMenuItem>
						<DropdownMenuItem disabled>
							<LuPlus className="size-4" strokeWidth={1.5} />
							Create blank project
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				<Dialog
					open={isOpen}
					onOpenChange={(open) => {
						if (!open) setIsOpen(false);
					}}
				>
					<DialogContent className="sm:max-w-[400px] p-0 gap-0">
						<DialogHeader className="px-4 pt-4 pb-2">
							<DialogTitle>Add Project</DialogTitle>
							<DialogDescription>
								Select a GitHub repository for your new project.
							</DialogDescription>
						</DialogHeader>
						<Command>
							<CommandInput placeholder="Search repositories..." />
							<CommandList>
								<CommandEmpty>
									{(repos ?? []).length === 0
										? "No GitHub repositories available. Connect GitHub in Settings."
										: "All repositories are already linked to projects."}
								</CommandEmpty>
								<CommandGroup>
									{availableRepos.map((repo) => (
										<CommandItem
											key={repo.id}
											value={repo.fullName}
											disabled={isCreating}
											onSelect={() => handleSelectRepo(repo.id, repo.name)}
										>
											{repo.fullName}
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</DialogContent>
				</Dialog>
			</div>
		);
	}

	return (
		<div className="border-t border-border p-2 flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
					>
						<LuFolderPlus className="size-4" strokeWidth={1.5} />
						<span>Add project</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start">
					<DropdownMenuItem onClick={() => setIsOpen(true)}>
						<SiGithub className="size-4" />
						From GitHub repository
					</DropdownMenuItem>
					<DropdownMenuItem disabled>
						<LuPlus className="size-4" strokeWidth={1.5} />
						Create blank project
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={isOpen}
				onOpenChange={(open) => {
					if (!open) setIsOpen(false);
				}}
			>
				<DialogContent className="sm:max-w-[400px] p-0 gap-0">
					<DialogHeader className="px-4 pt-4 pb-2">
						<DialogTitle>Add Project</DialogTitle>
						<DialogDescription>
							Select a GitHub repository for your new project.
						</DialogDescription>
					</DialogHeader>
					<Command>
						<CommandInput placeholder="Search repositories..." />
						<CommandList>
							<CommandEmpty>
								{(repos ?? []).length === 0
									? "No GitHub repositories available. Connect GitHub in Settings."
									: "All repositories are already linked to projects."}
							</CommandEmpty>
							<CommandGroup>
								{availableRepos.map((repo) => (
									<CommandItem
										key={repo.id}
										value={repo.fullName}
										disabled={isCreating}
										onSelect={() => handleSelectRepo(repo.id, repo.name)}
									>
										{repo.fullName}
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</DialogContent>
			</Dialog>
		</div>
	);
}
