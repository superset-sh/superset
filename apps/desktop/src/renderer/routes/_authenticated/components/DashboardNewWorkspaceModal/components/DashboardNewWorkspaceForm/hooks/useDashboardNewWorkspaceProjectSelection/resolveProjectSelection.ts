interface LocalProjectCandidate {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
}

interface GithubRepositoryCandidate {
	id: string;
	owner: string;
	name: string;
}

interface SelectedProjectCandidate {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
}

function normalize(value: string | null | undefined): string | null {
	const normalized = value?.trim().toLowerCase();
	return normalized ? normalized : null;
}

function getDirectoryName(path: string | null | undefined): string | null {
	const normalized = path?.trim();
	if (!normalized) return null;

	const parts = normalized.split("/").filter(Boolean);
	return parts.at(-1) ?? null;
}

export function resolveLocalProject({
	selectedProject,
	linkedGithubRepository,
	localProjects,
}: {
	selectedProject: SelectedProjectCandidate | null;
	linkedGithubRepository: GithubRepositoryCandidate | null;
	localProjects: LocalProjectCandidate[];
}): LocalProjectCandidate | null {
	if (linkedGithubRepository) {
		const linkedMatches = localProjects.filter((localProject) => {
			if (
				normalize(localProject.githubOwner) !==
				normalize(linkedGithubRepository.owner)
			) {
				return false;
			}

			const directoryName = getDirectoryName(localProject.mainRepoPath);
			return (
				normalize(localProject.name) ===
					normalize(linkedGithubRepository.name) ||
				normalize(directoryName) === normalize(linkedGithubRepository.name)
			);
		});

		return linkedMatches.length === 1 ? linkedMatches[0] : null;
	}

	if (!selectedProject) {
		return null;
	}

	const directoryTargets = [
		normalize(selectedProject.slug),
		normalize(selectedProject.name),
	].filter((target): target is string => target !== null);

	const directoryMatches = localProjects.filter((localProject) => {
		const directoryName = normalize(
			getDirectoryName(localProject.mainRepoPath),
		);
		return directoryName ? directoryTargets.includes(directoryName) : false;
	});

	if (directoryMatches.length === 1) {
		return directoryMatches[0];
	}

	const nameMatches = localProjects.filter(
		(localProject) =>
			normalize(localProject.name) === normalize(selectedProject.name),
	);

	return nameMatches.length === 1 ? nameMatches[0] : null;
}

export function resolveGithubRepositoryFromLocalProject({
	localProject,
	githubRepositories,
	githubOwner,
}: {
	localProject: LocalProjectCandidate | null;
	githubRepositories: GithubRepositoryCandidate[];
	githubOwner?: string | null;
}): GithubRepositoryCandidate | null {
	if (!localProject) {
		return null;
	}

	const owner = normalize(githubOwner ?? localProject.githubOwner);
	if (!owner) {
		return null;
	}

	const repoNames = [
		normalize(localProject.name),
		normalize(getDirectoryName(localProject.mainRepoPath)),
	].filter((name): name is string => name !== null);

	if (repoNames.length === 0) {
		return null;
	}

	const matches = githubRepositories.filter(
		(repository) =>
			normalize(repository.owner) === owner &&
			repoNames.includes(normalize(repository.name) ?? ""),
	);

	return matches.length === 1 ? matches[0] : null;
}
