import type { FileView } from "./types";
import { binaryWarningView } from "./views/BinaryWarningView";
import { codeView } from "./views/CodeView";
import { imageView } from "./views/ImageView";
import { markdownPreviewView } from "./views/MarkdownPreviewView";

// Order is preserved as a stable tiebreaker for equal-priority views.
// Exclusives (image, binary-warning) short-circuit resolution when matched.
export const ALL_VIEWS: FileView[] = [
	imageView,
	binaryWarningView,
	markdownPreviewView,
	codeView,
];
