import { msg } from "@lingui/core/macro";
import { isImageFile } from "shared/file-types";
import type { FileView } from "../../types";
import { ImageView } from "./ImageView";

export const imageView: FileView = {
	id: "image",
	label: msg({ message: "Image" }),
	match: (filePath) => isImageFile(filePath),
	priority: "exclusive",
	documentKind: "bytes",
	Renderer: ImageView,
};
