import { isVideoFile } from "shared/file-types";
import type { FileView } from "../../types";
import { VideoView } from "./VideoView";

export const videoView: FileView = {
	id: "video",
	label: "Video",
	match: (filePath) => isVideoFile(filePath),
	priority: "exclusive",
	documentKind: "bytes",
	Renderer: VideoView,
};
