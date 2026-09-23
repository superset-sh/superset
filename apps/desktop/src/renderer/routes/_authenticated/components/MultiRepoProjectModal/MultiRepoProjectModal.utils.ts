export interface SelectedFolder {
	path: string;
	name: string;
}

const MAX_FOLDER_NAME_LENGTH = 64;

/**
 * Mirrors `sanitizeFolderName` on the host, so the row shows the name the
 * server will store rather than one that changes on create.
 */
export function folderNameForPath(path: string): string {
	const base = path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
	const name = base
		.replace(/[^A-Za-z0-9._-]/g, "-")
		.replace(/^[^A-Za-z0-9]+/, "")
		.slice(0, MAX_FOLDER_NAME_LENGTH);
	return name || "repo";
}

export function appendFolder(
	folders: SelectedFolder[],
	path: string,
): SelectedFolder[] {
	const taken = new Set(folders.map((folder) => folder.name));
	const base = folderNameForPath(path);
	let name = base;
	let suffix = 2;
	while (taken.has(name)) {
		name = `${base}-${suffix}`;
		suffix += 1;
	}
	return [...folders, { path, name }];
}

export function removeFolder(
	folders: SelectedFolder[],
	path: string,
): SelectedFolder[] {
	return folders.filter((folder) => folder.path !== path);
}

export interface AttachedSourceFolder {
	path: string;
	projectId: string;
	repoPath: string;
}

export interface ProjectCreationClient {
	createProject: (name: string) => Promise<{ groupId: string }>;
	resolveRepository: (
		folder: SelectedFolder,
	) => Promise<{ projectId: string; repoPath: string }>;
	addSourceFolder: (input: {
		groupId: string;
		projectId: string;
		folder: string;
	}) => Promise<void>;
}

export interface ProjectCreationAttempt {
	groupId: string | null;
	attached: AttachedSourceFolder[];
}

export type ProjectCreationResult =
	| {
			status: "created";
			groupId: string;
			primaryProjectId: string;
			primaryRepoPath: string;
			attached: AttachedSourceFolder[];
	  }
	| {
			status: "failed";
			groupId: string | null;
			attached: AttachedSourceFolder[];
			folder: SelectedFolder | null;
			error: unknown;
	  };

export async function createProjectWithSourceFolders({
	client,
	name,
	folders,
	previousAttempt,
}: {
	client: ProjectCreationClient;
	name: string;
	folders: SelectedFolder[];
	previousAttempt?: ProjectCreationAttempt;
}): Promise<ProjectCreationResult> {
	const attached = [...(previousAttempt?.attached ?? [])];
	let groupId = previousAttempt?.groupId ?? null;

	if (!groupId) {
		try {
			groupId = (await client.createProject(name)).groupId;
		} catch (error) {
			return { status: "failed", groupId: null, attached, folder: null, error };
		}
	}

	for (const folder of folders) {
		if (attached.some((entry) => entry.path === folder.path)) continue;
		try {
			const repository = await client.resolveRepository(folder);
			await client.addSourceFolder({
				groupId,
				projectId: repository.projectId,
				folder: folder.name,
			});
			attached.push({
				path: folder.path,
				projectId: repository.projectId,
				repoPath: repository.repoPath,
			});
		} catch (error) {
			return { status: "failed", groupId, attached, folder, error };
		}
	}

	const primary = attached[0];
	if (!primary) {
		return {
			status: "failed",
			groupId,
			attached,
			folder: null,
			error: new Error("A project needs at least one source folder"),
		};
	}

	return {
		status: "created",
		groupId,
		primaryProjectId: primary.projectId,
		primaryRepoPath: primary.repoPath,
		attached,
	};
}
