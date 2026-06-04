// File-icon helpers now live in the shared `renderer/lib/fileIcons` module.
// Re-exported here so existing v1 FilesView imports keep working.
export {
	FileIcon,
	getFileIcon,
	resolveFileIconAssetUrl,
} from "renderer/lib/fileIcons";
