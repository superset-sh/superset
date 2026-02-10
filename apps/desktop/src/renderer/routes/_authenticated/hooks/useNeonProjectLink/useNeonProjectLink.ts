import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "../../providers/CollectionsProvider";

export function useNeonProjectLink() {
	const collections = useCollections();
	const utils = electronTrpc.useUtils();
	const linkMutation = electronTrpc.projects.linkToNeon.useMutation({
		onSuccess: () => {
			utils.projects.getRecents.invalidate();
		},
	});

	const { data: localProjects } = electronTrpc.projects.getRecents.useQuery();

	const { data: cloudProjects } = useLiveQuery(
		(q) =>
			q.from({ projects: collections.projects }).select(({ projects }) => ({
				id: projects.id,
				repoOwner: projects.repoOwner,
				repoName: projects.repoName,
			})),
		[collections.projects],
	);

	const linkingRef = useRef(new Set<string>());

	const linkProjects = useCallback(() => {
		if (!localProjects || !cloudProjects) return;

		for (const local of localProjects) {
			if (local.neonProjectId || !local.githubOwner) continue;
			if (linkingRef.current.has(local.id)) continue;

			const repoName = local.mainRepoPath.split("/").pop();
			if (!repoName) continue;

			const match = cloudProjects.find(
				(cloud) =>
					cloud.repoOwner === local.githubOwner && cloud.repoName === repoName,
			);

			if (match) {
				linkingRef.current.add(local.id);
				linkMutation.mutate(
					{ id: local.id, neonProjectId: match.id },
					{
						onError: () => {
							linkingRef.current.delete(local.id);
						},
					},
				);
			}
		}
	}, [localProjects, cloudProjects, linkMutation]);

	useEffect(() => {
		linkProjects();
	}, [linkProjects]);
}
