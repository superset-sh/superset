import { ChatCodeBlock } from "./components/ChatCodeBlock";
import { ChatLink } from "./components/ChatLink";

/** The transcript and the composer share one column so their edges line up. */
export const CHAT_GUTTER_CLASSNAME = "px-6";
/** The same gutter for a scroller, less the space it reserves for scrollbars. */
export const CHAT_SCROLLER_GUTTER_CLASSNAME =
	"px-[max(0px,calc(1.5rem-var(--scrollbar-gutter,0px)))]";
export const CHAT_COLUMN_CLASSNAME = "mx-auto w-full max-w-3xl";

export const CHAT_MARKDOWN_COMPONENTS = { code: ChatCodeBlock, a: ChatLink };
