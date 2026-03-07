import rawManifest from "resources/public/file-icons/manifest.json";

interface FileIconManifest {
	fileNames: Record<string, string>;
	fileExtensions: Record<string, string>;
	folderNames: Record<string, string>;
	folderNamesExpanded: Record<string, string>;
	defaultIcon: string;
	defaultFolderIcon: string;
	defaultFolderOpenIcon: string;
}

const manifest = rawManifest as FileIconManifest;

interface FileIconResult {
	src: string;
}

export function getFileIcon(
	fileName: string,
	isDirectory: boolean,
	isOpen = false,
): FileIconResult {
	if (isDirectory) {
		const baseName = fileName.toLowerCase();
		if (isOpen && manifest.folderNamesExpanded[baseName]) {
			return {
				src: `/file-icons/${manifest.folderNamesExpanded[baseName]}.svg`,
			};
		}
		if (manifest.folderNames[baseName]) {
			const iconName = isOpen
				? (manifest.folderNamesExpanded[baseName] ??
					manifest.folderNames[baseName])
				: manifest.folderNames[baseName];
			return { src: `/file-icons/${iconName}.svg` };
		}
		return {
			src: `/file-icons/${isOpen ? manifest.defaultFolderOpenIcon : manifest.defaultFolderIcon}.svg`,
		};
	}

	// Check exact filename match (case-sensitive first, then lowercase)
	const fileNameLower = fileName.toLowerCase();
	if (manifest.fileNames[fileName]) {
		return { src: `/file-icons/${manifest.fileNames[fileName]}.svg` };
	}
	if (manifest.fileNames[fileNameLower]) {
		return { src: `/file-icons/${manifest.fileNames[fileNameLower]}.svg` };
	}

	// Check file extensions (try compound extensions first, e.g. "d.ts" before "ts")
	const dotIndex = fileName.indexOf(".");
	if (dotIndex !== -1) {
		const afterFirstDot = fileName.slice(dotIndex + 1).toLowerCase();
		const segments = afterFirstDot.split(".");
		for (let i = 0; i < segments.length; i++) {
			const ext = segments.slice(i).join(".");
			if (manifest.fileExtensions[ext]) {
				return { src: `/file-icons/${manifest.fileExtensions[ext]}.svg` };
			}
		}
	}

	return { src: `/file-icons/${manifest.defaultIcon}.svg` };
}
