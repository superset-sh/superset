export type { IRange } from "./buffer-helpers";
export {
	convertLinkRangeToBuffer,
	getXtermLineContent,
} from "./buffer-helpers";

export { LinkDetectorAdapter } from "./link-detector-adapter";

export {
	type LinkResolverOptions,
	type ResolvedLink,
	type StatCallback,
	TerminalLinkResolver,
} from "./link-resolver";

export {
	type DetectedLink,
	LocalLinkDetector,
	type LocalLinkDetectorOptions,
} from "./local-link-detector";
