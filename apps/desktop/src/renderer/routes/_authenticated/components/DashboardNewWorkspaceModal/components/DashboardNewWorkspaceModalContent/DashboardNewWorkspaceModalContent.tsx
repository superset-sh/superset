import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { PromptGroup } from "../DashboardNewWorkspaceForm/PromptGroup";

interface DashboardNewWorkspaceModalContentProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

/**
 * Content pane for the Dashboard new-workspace modal.
 *
 * Resolves the project list from V2 collections (`v2Projects` +
 * `githubRepositories`) and handles the initial project selection when the
 * modal opens. Delegates the composer itself to PromptGroup.
 */
export function DashboardNewWorkspaceModalContent({
	isOpen,
	preSelectedProjectId,
}: DashboardNewWorkspaceModalContentProps) {
	const { draft, updateDraft } = useDashboardNewWorkspaceDraft();
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
				name: repos.name,
			})),
		[collections],
	);

	const recentProjects = useMemo(() => {
		const repoById = new Map(
			(githubRepositories ?? []).map((repo) => [repo.id, repo]),
		);
		return (v2Projects ?? []).map((project) => {
			const repo = project.githubRepositoryId
				? (repoById.get(project.githubRepositoryId) ?? null)
				: null;
			return {
				id: project.id,
				name: project.name,
				githubOwner: repo?.owner ?? null,
				githubRepoName: repo?.name ?? null,
			};
		});
	}, [githubRepositories, v2Projects]);

	const areProjectsReady = v2Projects !== undefined;
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
			if (!areProjectsReady) return;
			const hasPreSelectedProject = recentProjects.some(
				(project) => project.id === preSelectedProjectId,
			);
			if (hasPreSelectedProject) {
				appliedPreSelectionRef.current = preSelectedProjectId;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		if (!areProjectsReady) return;

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			updateDraft({ selectedProjectId: recentProjects[0]?.id ?? null });
		}
	}, [
		draft.selectedProjectId,
		areProjectsReady,
		isOpen,
		preSelectedProjectId,
		recentProjects,
		updateDraft,
	]);

	const selectedProject = recentProjects.find(
		(project) => project.id === draft.selectedProjectId,
	);

	return (
		<div className="flex-1 overflow-y-auto">
			<PromptGroup
				projectId={draft.selectedProjectId}
				selectedProject={selectedProject}
				recentProjects={recentProjects.filter((project) => Boolean(project.id))}
				onSelectProject={(selectedProjectId) =>
					updateDraft({ selectedProjectId })
				}
			/>
		</div>
	);
}
