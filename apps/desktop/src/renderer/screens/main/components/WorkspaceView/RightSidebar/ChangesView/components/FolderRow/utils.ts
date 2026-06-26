export function splitFolderDisplayPath(displayName: string): {
	parentPath: string;
	folderName: string;
} {
	const lastSlash = displayName.lastIndexOf("/");
	if (lastSlash < 0) {
		return { parentPath: "", folderName: displayName };
	}
	return {
		parentPath: displayName.slice(0, lastSlash),
		folderName: displayName.slice(lastSlash + 1),
	};
}
