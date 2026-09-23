/** A row of `project.folders.list`. Position 0 is the project's primary. */
export interface ProjectFolder {
	id: string;
	projectId: string;
	position: number;
	folder: string;
	repoPath: string | null;
	repoUrl: string | null;
	baseBranch: string | null;
}
