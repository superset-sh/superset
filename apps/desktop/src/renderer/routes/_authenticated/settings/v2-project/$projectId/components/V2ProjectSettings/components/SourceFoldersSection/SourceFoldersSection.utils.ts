import type { ProjectFolder } from "./types";

/** Optimistic mirror of `project.folders.setPrimary`. */
export function withPrimaryFolder(
	folders: ProjectFolder[],
	folderId: string,
): ProjectFolder[] {
	const target = folders.find((folder) => folder.id === folderId);
	if (!target) return folders;
	return [target, ...folders.filter((folder) => folder.id !== folderId)].map(
		(folder, position) => ({ ...folder, position }),
	);
}

/** Optimistic mirror of `project.folders.remove`, which closes the gap. */
export function withoutFolder(
	folders: ProjectFolder[],
	folderId: string,
): ProjectFolder[] {
	return folders
		.filter((folder) => folder.id !== folderId)
		.map((folder, position) => ({ ...folder, position }));
}

export interface SourceFolderMemberInput {
	id: string;
	projectId: string;
	position: number;
	folder: string;
	baseBranch: string | null;
}

export interface SourceFolderRepositoryInput {
	id: string;
	repoPath: string;
	repoUrl: string | null;
}

export function toSourceFolders(
	members: SourceFolderMemberInput[],
	repositories: SourceFolderRepositoryInput[],
): ProjectFolder[] {
	const repositoryById = new Map(
		repositories.map((repository) => [repository.id, repository]),
	);
	return [...members]
		.sort((left, right) => left.position - right.position)
		.map((member) => {
			const repository = repositoryById.get(member.projectId);
			return {
				id: member.id,
				projectId: member.projectId,
				position: member.position,
				folder: member.folder,
				repoPath: repository?.repoPath ?? null,
				repoUrl: repository?.repoUrl ?? null,
				baseBranch: member.baseBranch,
			};
		});
}
