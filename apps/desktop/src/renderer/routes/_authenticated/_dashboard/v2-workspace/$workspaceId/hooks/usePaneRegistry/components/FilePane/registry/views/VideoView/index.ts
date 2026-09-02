import { msg } from "@lingui/core/macro";
import { isPreviewableVideoFile } from "shared/file-types";
import type { FileView } from "../../types";
import { VideoView } from "./VideoView";

export const videoView: FileView = {
	id: "video",
	label: msg({ id: "workspace.filePane.viewVideo", message: "Video" }),
	match: (filePath) => isPreviewableVideoFile(filePath),
	priority: "exclusive",
	documentKind: "bytes",
	Renderer: VideoView,
};
