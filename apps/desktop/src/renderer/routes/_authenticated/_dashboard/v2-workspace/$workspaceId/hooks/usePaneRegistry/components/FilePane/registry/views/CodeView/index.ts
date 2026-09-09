import { msg } from "@lingui/core/macro";
import { isMarkdownFile } from "shared/file-types";
import type { FileView } from "../../types";
import { CodeView } from "./CodeView";

export const codeView: FileView = {
	id: "code",
	label: (filePath) =>
		isMarkdownFile(filePath)
			? msg({ message: "Markdown" })
			: msg({ message: "Code" }),
	match: (_, meta) => meta.isBinary !== true,
	priority: "builtin",
	documentKind: "text",
	Renderer: CodeView,
};
