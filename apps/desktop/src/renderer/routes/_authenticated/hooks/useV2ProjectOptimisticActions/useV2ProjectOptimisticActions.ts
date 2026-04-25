import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useOptimisticCollectionMutation } from "../useOptimisticCollectionMutation";

interface V2ProjectPatch {
	name?: string;
	slug?: string;
	repoCloneUrl?: string | null;
	githubRepositoryId?: string | null;
}

export function useV2ProjectOptimisticActions() {
	const collections = useCollections();
	const runMutation = useOptimisticCollectionMutation(
		"useV2ProjectOptimisticActions",
	);

	return useMemo(
		() => ({
			updateProject: (projectId: string, patch: V2ProjectPatch) =>
				runMutation("Failed to update project", () =>
					collections.v2Projects.update(projectId, (draft) => {
						if (patch.name !== undefined) {
							draft.name = patch.name;
						}
						if (patch.slug !== undefined) {
							draft.slug = patch.slug;
						}
						if (patch.repoCloneUrl !== undefined) {
							draft.repoCloneUrl = patch.repoCloneUrl;
						}
						if (patch.githubRepositoryId !== undefined) {
							draft.githubRepositoryId = patch.githubRepositoryId;
						}
					}),
				),
			renameProject: (projectId: string, name: string) =>
				runMutation("Failed to rename project", () =>
					collections.v2Projects.update(projectId, (draft) => {
						draft.name = name;
					}),
				),
			updateRepository: (projectId: string, repoCloneUrl: string | null) =>
				runMutation("Failed to update project repository", () =>
					collections.v2Projects.update(projectId, (draft) => {
						draft.repoCloneUrl = repoCloneUrl;
						draft.githubRepositoryId = null;
					}),
				),
		}),
		[collections, runMutation],
	);
}
