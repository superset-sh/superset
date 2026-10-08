import {
	ChatMarkdown,
	chatMarkdownFirstBlock,
} from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import {
	CHAT_MARKDOWN_COMPONENTS,
	CHAT_REMARK_PLUGINS,
} from "../../../../../../constants";

/**
 * ACP carries tool-result text as markdown — Zed renders it that way, and
 * neither our adapter nor the bundled ones add fences — so a fenced block here
 * is the model writing markdown into a result (a subagent's summary, plan
 * text). Rendering it as markdown is reading what the data says; peeling one
 * fence off inside a `<pre>` was guessing at a content type it never carried.
 *
 * The content that really is raw — patches and terminal output — arrives as
 * `diff` and `terminal`, and keeps its own renderer.
 */
export function TextContent({ text }: { text: string }) {
	return (
		<ChatMarkdown
			className={cn(
				chatMarkdownFirstBlock,
				"min-w-0 text-muted-foreground text-xs",
			)}
			components={CHAT_MARKDOWN_COMPONENTS}
			remarkPlugins={CHAT_REMARK_PLUGINS}
		>
			{text}
		</ChatMarkdown>
	);
}
