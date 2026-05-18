import rawManifest from "resources/public/file-icons/manifest.json";

/**
 * Shape of `resources/public/file-icons/manifest.json` — the Material-icon-theme
 * mapping we ship alongside the renderer. `defaultIcon` / `defaultFolder*` are
 * the catch-all icons used whenever a file/folder name or extension isn't
 * recognized, so every entity gets *some* icon.
 */
export interface FileIconManifest {
	fileNames: Record<string, string>;
	fileExtensions: Record<string, string>;
	folderNames: Record<string, string>;
	folderNamesExpanded: Record<string, string>;
	defaultIcon: string;
	defaultFolderIcon: string;
	defaultFolderOpenIcon: string;
}

export const fileIconManifest = rawManifest as FileIconManifest;
