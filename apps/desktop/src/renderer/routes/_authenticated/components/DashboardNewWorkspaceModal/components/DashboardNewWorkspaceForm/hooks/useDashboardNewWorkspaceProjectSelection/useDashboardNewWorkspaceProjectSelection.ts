import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	resolveGithubRepositoryFromLocalProject,
	resolveLocalProject,
} from "./resolveProjectSelection";

interface UseDashboardNewWorkspaceProjectSelectionOptions {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	selectedProjectId: string | null;
	onSelectProject: (projectId: string | null) => void;
}

export function useDashboardNewWorkspaceProjectSelection({
	isOpen,
	preSelectedProjectId,
	selectedProjectId,
	onSelectProject,
}: UseDashboardNewWorkspaceProjectSelectionOptions) {
	const collections = useCollections();

	const { data: v2ProjectsData } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.select(({ projects }) => ({ ...projects })),
		[collections],
	);
	const v2Projects = useMemo(() => v2ProjectsData ?? [], [v2ProjectsData]);
	const areV2ProjectsReady = v2ProjectsData !== undefined;

	const appliedPreSelectionRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current
		) {
			if (!areV2ProjectsReady) return;
			const hasPreSelectedProject = v2Projects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== selectedProjectId) {
					onSelectProject(preSelectedProjectId);
				}
				return;
			}
		}

		if (!areV2ProjectsReady) return;

		const hasSelectedProject = v2Projects.some(
			(project) => project.id === selectedProjectId,
		);
		if (!hasSelectedProject) {
			const nextProjectId = v2Projects[0]?.id ?? null;
			if (nextProjectId !== selectedProjectId) {
				onSelectProject(nextProjectId);
			}
		}
	}, [
		selectedProjectId,
		areV2ProjectsReady,
		isOpen,
		onSelectProject,
		preSelectedProjectId,
		v2Projects,
	]);

	const selectedProject =
		v2Projects.find((project) => project.id === selectedProjectId) ?? null;
	const { data: localProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	const { data: githubRepositoriesData } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
				name: repos.name,
			})),
		[collections],
	);
	const githubRepositories = useMemo(
		() => githubRepositoriesData ?? [],
		[githubRepositoriesData],
	);

	const linkedGithubRepository = useMemo(
		() =>
			githubRepositories.find(
				(repository) => repository.id === selectedProject?.githubRepositoryId,
			) ?? null,
		[githubRepositories, selectedProject?.githubRepositoryId],
	);

	const localProject = useMemo(
		() =>
			resolveLocalProject({
				selectedProject,
				linkedGithubRepository,
				localProjects,
			}),
		[linkedGithubRepository, localProjects, selectedProject],
	);

	const { data: githubAvatar } = electronTrpc.projects.getGitHubAvatar.useQuery(
		{ id: localProject?.id ?? "" },
		{ enabled: !!localProject && !localProject.githubOwner },
	);

	const inferredGithubRepository = useMemo(
		() =>
			resolveGithubRepositoryFromLocalProject({
				localProject,
				githubRepositories,
				githubOwner: githubAvatar?.owner ?? localProject?.githubOwner ?? null,
			}),
		[githubAvatar?.owner, githubRepositories, localProject],
	);

	const githubRepository = linkedGithubRepository ?? inferredGithubRepository;
	const githubRepositoryId = githubRepository?.id ?? null;
	const persistedAutoLinkRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			!selectedProject ||
			selectedProject.githubRepositoryId ||
			!githubRepository
		) {
			return;
		}

		const linkKey = `${selectedProject.id}:${githubRepository.id}`;
		if (persistedAutoLinkRef.current === linkKey) {
			return;
		}

		persistedAutoLinkRef.current = linkKey;

		void apiTrpcClient.v2Project.update
			.mutate({
				id: selectedProject.id,
				githubRepositoryId: githubRepository.id,
			})
			.catch((error) => {
				console.warn(
					"[dashboard-new-workspace] Failed to auto-link GitHub repository:",
					error,
				);
				persistedAutoLinkRef.current = null;
			});
	}, [githubRepository, selectedProject]);

	return {
		githubRepository,
		githubRepositoryId,
		localProjectId: localProject?.id ?? null,
		selectedProject,
		v2Projects,
	};
}
