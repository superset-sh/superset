import { isMarkdownFile } from "shared/file-types";
import type { FileView } from "../../types";
import { MarkdownPreviewView } from "./MarkdownPreviewView";

export const markdownPreviewView: FileView = {
	id: "markdown-preview",
	label: "Preview",
	match: (filePath) => isMarkdownFile(filePath),
	priority: "option",
	documentKind: "text",
	Renderer: MarkdownPreviewView,
};
