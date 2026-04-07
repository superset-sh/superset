export { convertLinkRangeToBuffer, getXtermLineContent } from "./buffer-helpers";
export type { IRange } from "./buffer-helpers";

export { LinkDetectorAdapter } from "./link-detector-adapter";

export {
	TerminalLinkResolver,
	type LinkResolverOptions,
	type ResolvedLink,
	type StatCallback,
} from "./link-resolver";

export {
	LocalLinkDetector,
	type DetectedLink,
	type LocalLinkDetectorOptions,
} from "./local-link-detector";
