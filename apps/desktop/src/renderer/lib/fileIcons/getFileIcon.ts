import { fileIconManifest as manifest } from "./manifest";
import { resolveFileIconAssetUrl } from "./resolveFileIconAssetUrl";

interface FileIconResult {
	src: string;
}

/**
 * Resolve the asset URL for a file/folder's icon from the Material-icon
 * manifest. Always returns a result — when nothing matches, falls back to
 * `manifest.defaultIcon` (files) or `manifest.defaultFolder*Icon` (folders).
 */
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
