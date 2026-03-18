import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ResolvedGithubRepository {
	owner: string;
	name: string;
}

export function useResolvedLocalProject(
	githubRepository: ResolvedGithubRepository | null,
) {
	const { data: localProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	return useMemo(() => {
		if (!githubRepository) return null;
		const match = localProjects.find((localProject) => {
			if (localProject.githubOwner !== githubRepository.owner) return false;
			if (localProject.name === githubRepository.name) return true;

			const directoryName = localProject.mainRepoPath?.split("/").pop();
			return directoryName === githubRepository.name;
		});

		return match?.id ?? null;
	}, [githubRepository, localProjects]);
}
