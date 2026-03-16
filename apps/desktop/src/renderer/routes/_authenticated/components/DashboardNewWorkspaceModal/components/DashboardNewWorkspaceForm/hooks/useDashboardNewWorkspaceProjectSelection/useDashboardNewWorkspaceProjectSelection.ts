import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

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
			onSelectProject(v2Projects[0]?.id ?? null);
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
	const githubRepositoryId = selectedProject?.githubRepositoryId ?? null;

	const { data: githubRepoData } = useLiveQuery(
		(q) =>
			q
				.from({ repos: collections.githubRepositories })
				.where(({ repos }) => eq(repos.id, githubRepositoryId ?? ""))
				.select(({ repos }) => ({
					id: repos.id,
					owner: repos.owner,
					name: repos.name,
				})),
		[collections, githubRepositoryId],
	);

	return {
		githubRepository: githubRepoData?.[0] ?? null,
		githubRepositoryId,
		selectedProject,
		v2Projects,
	};
}
