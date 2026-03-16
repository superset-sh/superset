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
import { toast } from "@superset/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface AddProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

interface GithubRepository {
	id: string;
	fullName: string;
	name: string;
}

export function AddProjectDialog({
	open,
	onOpenChange,
}: AddProjectDialogProps) {
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

	const availableRepos = useMemo(() => {
		const usedRepoIds = new Set(
			(existingProjects ?? [])
				.map((project) => project.githubRepositoryId)
				.filter(Boolean),
		);

		return (repos ?? []).filter((repo) => !usedRepoIds.has(repo.id));
	}, [existingProjects, repos]);

	const handleSelectRepo = async ({ id, name }: GithubRepository) => {
		const slug =
			name
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "") || "project";

		setIsCreating(true);
		try {
			await apiTrpcClient.v2Project.create.mutate({
				name,
				slug,
				githubRepositoryId: id,
			});
			toast.success(`Project "${name}" created`);
			onOpenChange(false);
		} catch (error) {
			toast.error("Failed to create project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<Dialog modal open={open} onOpenChange={onOpenChange}>
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
									onSelect={() => handleSelectRepo(repo)}
								>
									{repo.fullName}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
