import rawManifest from "resources/public/file-icons/manifest.json";
import { resolveFileIconAssetUrl } from "./resolveFileIconAssetUrl";

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
				src: resolveFileIconAssetUrl(manifest.folderNamesExpanded[baseName]),
			};
		}
		if (manifest.folderNames[baseName]) {
			const iconName = isOpen
				? (manifest.folderNamesExpanded[baseName] ??
					manifest.folderNames[baseName])
				: manifest.folderNames[baseName];
			return { src: resolveFileIconAssetUrl(iconName) };
		}
		return {
			src: resolveFileIconAssetUrl(
				isOpen ? manifest.defaultFolderOpenIcon : manifest.defaultFolderIcon,
			),
		};
	}

	// Check exact filename match (case-sensitive first, then lowercase)
	const fileNameLower = fileName.toLowerCase();
	if (manifest.fileNames[fileName]) {
		return { src: resolveFileIconAssetUrl(manifest.fileNames[fileName]) };
	}
	if (manifest.fileNames[fileNameLower]) {
		return { src: resolveFileIconAssetUrl(manifest.fileNames[fileNameLower]) };
	}

	// Check file extensions (try compound extensions first, e.g. "d.ts" before "ts")
	const dotIndex = fileName.indexOf(".");
	if (dotIndex !== -1) {
		const afterFirstDot = fileName.slice(dotIndex + 1).toLowerCase();
		const segments = afterFirstDot.split(".");
		for (let i = 0; i < segments.length; i++) {
			const ext = segments.slice(i).join(".");
			if (manifest.fileExtensions[ext]) {
				return { src: resolveFileIconAssetUrl(manifest.fileExtensions[ext]) };
			}
		}
	}

	return { src: resolveFileIconAssetUrl(manifest.defaultIcon) };
}
