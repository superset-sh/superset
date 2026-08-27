import { isPdfFile } from "shared/file-types";
import type { FileView } from "../../types";
import { PdfView } from "./PdfView";

export const pdfView: FileView = {
	id: "pdf",
	label: "PDF",
	match: (filePath) => isPdfFile(filePath),
	priority: "exclusive",
	documentKind: "bytes",
	Renderer: PdfView,
};
