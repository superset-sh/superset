import { Text } from "@tiptap/extension-text";
import type { MarkdownNodeSpec } from "tiptap-markdown";

/**
 * tiptap-markdown escapes `<` and `>` to entities on every text node
 * (extensions/nodes/text.js), so a typed `2 > 1` serializes as `2 &gt; 1`.
 * That protects its own round trip, which re-parses output as
 * markdown-with-HTML. Ours isn't one: this markdown reaches agent CLIs over
 * argv/stdin and lands in stored task and automation prompts, where nothing
 * decodes it again.
 *
 * Emit text as typed. prosemirror-markdown still escapes real markdown
 * syntax, so only the HTML entity layer goes away.
 */
export const TextWithoutHtmlEscape = Text.extend({
	addStorage() {
		return {
			markdown: {
				serialize(state, node) {
					state.text(node.text ?? "");
				},
				parse: {},
			} satisfies MarkdownNodeSpec,
		};
	},
});
