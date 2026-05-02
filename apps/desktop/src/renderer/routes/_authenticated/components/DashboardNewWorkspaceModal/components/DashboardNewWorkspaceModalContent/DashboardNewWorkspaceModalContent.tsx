import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { MOCK_ORG_ID } from "shared/constants";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { PromptGroup } from "../DashboardNewWorkspaceForm/PromptGroup";
import { useSelectedHostProjectIds } from "./hooks/useSelectedHostProjectIds";

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
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({ ...projects })),
		[collections, activeOrganizationId],
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

	const setUpProjectIds = useSelectedHostProjectIds(draft.hostTarget);

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
				needsSetup:
					setUpProjectIds === null ? null : !setUpProjectIds.has(project.id),
			};
		});
	}, [githubRepositories, setUpProjectIds, v2Projects]);

	const areProjectsReady = v2Projects !== undefined;
	const appliedPreSelectionRef = useRef<string | null>(null);
	const appliedHostTargetRef = useRef(false);
	const hasInitializedSelectionRef = useRef(false);

	useEffect(() => {
		if (!isOpen) {
			appliedPreSelectionRef.current = null;
			appliedHostTargetRef.current = false;
			hasInitializedSelectionRef.current = false;
			return;
		}
		if (appliedHostTargetRef.current) return;
		appliedHostTargetRef.current = true;
		const persistedHostTarget =
			useV2WorkspaceCreateDefaultsStore.getState().lastHostTarget;
		const validHostTarget =
			persistedHostTarget?.kind === "local"
				? persistedHostTarget
				: persistedHostTarget?.kind === "host" &&
						typeof persistedHostTarget.hostId === "string"
					? persistedHostTarget
					: null;
		if (validHostTarget) {
			updateDraft({ hostTarget: validHostTarget });
		}
	}, [isOpen, updateDraft]);

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
				hasInitializedSelectionRef.current = true;
				if (preSelectedProjectId !== draft.selectedProjectId) {
					updateDraft({ selectedProjectId: preSelectedProjectId });
				}
				return;
			}
		}

		if (!areProjectsReady) return;
		// Wait for org context. Without it, v2Projects is filtered by an empty
		// org id and resolves to []; initializing here would lock in a null
		// selection before the real project list arrives.
		if (activeOrganizationId === null) return;

		// Only auto-pick a default once. After init, leave the user's selection
		// alone — including freshly created projects that may not be in the live
		// query yet (they'll appear momentarily and the picker will show them).
		if (hasInitializedSelectionRef.current) return;

		const hasSelectedProject = recentProjects.some(
			(project) => project.id === draft.selectedProjectId,
		);
		if (!hasSelectedProject) {
			const { lastProjectId } = useV2WorkspaceCreateDefaultsStore.getState();
			const persistedProjectId =
				lastProjectId &&
				recentProjects.some((project) => project.id === lastProjectId)
					? lastProjectId
					: null;
			updateDraft({
				selectedProjectId: persistedProjectId ?? recentProjects[0]?.id ?? null,
			});
		}
		hasInitializedSelectionRef.current = true;
	}, [
		draft.selectedProjectId,
		areProjectsReady,
		activeOrganizationId,
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
				onSelectProject={(selectedProjectId) => {
					setLastProjectId(selectedProjectId);
					updateDraft({ selectedProjectId });
				}}
			/>
		</div>
	);
}
