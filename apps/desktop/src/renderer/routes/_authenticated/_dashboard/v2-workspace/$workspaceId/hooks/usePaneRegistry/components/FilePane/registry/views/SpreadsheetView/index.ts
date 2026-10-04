import { msg } from "@lingui/core/macro";
import { isDelimitedTextFile, isSpreadsheetFile } from "shared/file-types";
import type { FileView } from "../../types";
import { SpreadsheetView } from "./SpreadsheetView";

export const spreadsheetView: FileView = {
	id: "spreadsheet",
	label: msg({ message: "Spreadsheet" }),
	match: (filePath) => isSpreadsheetFile(filePath),
	priority: "exclusive",
	documentKind: "bytes",
	Renderer: SpreadsheetView,
};

export const tableView: FileView = {
	id: "table",
	label: msg({ message: "Table" }),
	match: (filePath, meta) =>
		isDelimitedTextFile(filePath) && meta.isBinary !== true,
	priority: "default",
	documentKind: "text",
	Renderer: SpreadsheetView,
};
