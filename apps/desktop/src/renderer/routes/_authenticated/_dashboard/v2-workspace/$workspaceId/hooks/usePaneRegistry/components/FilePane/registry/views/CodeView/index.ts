import { msg } from "@lingui/core/macro";
import { isDelimitedTextFile, isMarkdownFile } from "shared/file-types";
import type { FileView } from "../../types";
import { CodeView } from "./CodeView";

export const codeView: FileView = {
	id: "code",
	label: (filePath) => {
		if (isMarkdownFile(filePath)) return msg({ message: "Markdown" });
		if (isDelimitedTextFile(filePath)) return msg({ message: "Raw" });
		return msg({ message: "Code" });
	},
	match: (_, meta) => meta.isBinary !== true,
	priority: "builtin",
	documentKind: "text",
	Renderer: CodeView,
};
