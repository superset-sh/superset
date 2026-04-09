export type { IRange } from "./buffer-helpers";
export {
	convertLinkRangeToBuffer,
	getXtermLineContent,
} from "./buffer-helpers";

export { LinkDetectorAdapter } from "./link-detector-adapter";

export {
	type ResolvedLink,
	type StatCallback,
	TerminalLinkResolver,
} from "./link-resolver";

export {
	type DetectedLink,
	LocalLinkDetector,
} from "./local-link-detector";

export { WordLinkDetector } from "./word-link-detector";
