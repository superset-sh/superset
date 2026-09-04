import { msg } from "@lingui/core/macro";
import type { FileView } from "../../types";
import { BinaryWarningView } from "./BinaryWarningView";

export const binaryWarningView: FileView = {
	id: "binary-warning",
	label: msg({ message: "Binary" }),
	match: (_, meta) => meta.isBinary === true,
	priority: "default",
	documentKind: "bytes",
	Renderer: BinaryWarningView,
};
