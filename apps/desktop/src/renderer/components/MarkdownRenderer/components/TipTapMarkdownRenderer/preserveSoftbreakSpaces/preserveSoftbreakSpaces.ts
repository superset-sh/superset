import { Extension } from "@tiptap/core";

export function softbreakNewlineToSpace(text: string): string {
	return /^\n\S/.test(text) ? ` ${text.slice(1)}` : text;
}

export function preserveSoftbreakSpacesInDOM(root: ParentNode): void {
	root.querySelectorAll("*").forEach((el) => {
		const next = el.nextSibling;
		if (next?.nodeType !== Node.TEXT_NODE || el.closest("pre")) {
			return;
		}

		const text = next.textContent;
		if (text == null) {
			return;
		}

		const fixed = softbreakNewlineToSpace(text);
		if (fixed !== text) {
			next.textContent = fixed;
		}
	});
}

export const PreserveSoftbreakSpaces = Extension.create({
	name: "preserveSoftbreakSpaces",

	addStorage() {
		return {
			markdown: {
				parse: {
					updateDOM(element: HTMLElement) {
						preserveSoftbreakSpacesInDOM(element);
					},
				},
			},
		};
	},
});
