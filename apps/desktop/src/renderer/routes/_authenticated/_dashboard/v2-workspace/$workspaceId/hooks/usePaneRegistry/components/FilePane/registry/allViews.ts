import type { FileView } from "./types";
import { binaryWarningView } from "./views/BinaryWarningView";
import { codeView } from "./views/CodeView";
import { imageView } from "./views/ImageView";
import { markdownPreviewView } from "./views/MarkdownPreviewView";
import { videoView } from "./views/VideoView";

// Order is preserved as a stable tiebreaker for equal-priority views.
// Exclusive views short-circuit resolution when matched.
export const ALL_VIEWS: FileView[] = [
	imageView,
	videoView,
	binaryWarningView,
	markdownPreviewView,
	codeView,
];
