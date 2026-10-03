import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";

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
		<ChatMarkdown className="min-w-0 text-muted-foreground text-xs">
			{text}
		</ChatMarkdown>
	);
}
