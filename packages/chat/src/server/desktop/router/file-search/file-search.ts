import {
	type FsSearchMatch,
	searchFiles as rawSearchFiles,
	type SearchFilesOptions,
} from "@superset/workspace-fs/host";

export type FileSearchItem = {
	absolutePath: string;
	relativePath: string;
	name: string;
	isDirectory: boolean;
};

export type FileSearchResult = FsSearchMatch & {
	id: string;
	isDirectory: boolean;
};

export type { SearchFilesOptions };

export async function searchFiles(
	options: SearchFilesOptions,
): Promise<FileSearchResult[]> {
	const matches = await rawSearchFiles(options);
	return matches.map((match) => ({
		...match,
		id: match.absolutePath,
		isDirectory: match.kind === "directory",
	}));
}
