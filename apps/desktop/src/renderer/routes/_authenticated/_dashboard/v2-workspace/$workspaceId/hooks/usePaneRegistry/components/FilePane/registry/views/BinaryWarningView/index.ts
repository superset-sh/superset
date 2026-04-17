import type { FileView } from "../../types";
import { BinaryWarningView } from "./BinaryWarningView";

export const binaryWarningView: FileView = {
	id: "binary-warning",
	label: "Binary",
	match: (_, meta) => meta.isBinary === true,
	priority: "default",
	documentKind: "bytes",
	Renderer: BinaryWarningView,
};
