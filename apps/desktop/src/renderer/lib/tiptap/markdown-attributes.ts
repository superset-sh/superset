import type { Attributes } from "@tiptap/core";
import Link from "@tiptap/extension-link";

/**
 * @tiptap/core's default attribute parser runs getAttribute through fromString,
 * which turns "2024" into a number and "true" into a boolean. The markdown
 * serializers call .replace on these attributes, so a single coerced value
 * throws on every serialization of that document from then on — the editor
 * stops emitting changes and the content stops saving. Declaring parseHTML
 * keeps the value the string it was authored as.
 */
export function verbatimStringAttributes(...names: string[]): Attributes {
	return Object.fromEntries(
		names.map((name) => [
			name,
			{
				default: null,
				parseHTML: (element: HTMLElement) => element.getAttribute(name),
			},
		]),
	);
}

export const SafeLink = Link.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...verbatimStringAttributes("title"),
		};
	},
});
