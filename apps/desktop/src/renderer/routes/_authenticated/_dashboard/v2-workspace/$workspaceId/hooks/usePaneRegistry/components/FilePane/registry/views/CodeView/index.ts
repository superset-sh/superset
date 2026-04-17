import { isMarkdownFile } from "shared/file-types";
import type { FileView } from "../../types";
import { CodeView } from "./CodeView";

export const codeView: FileView = {
	id: "code",
	label: (filePath) => (isMarkdownFile(filePath) ? "Markdown" : "Code"),
	match: (_, meta) => meta.isBinary !== true,
	priority: "builtin",
	documentKind: "text",
	Renderer: CodeView,
};
