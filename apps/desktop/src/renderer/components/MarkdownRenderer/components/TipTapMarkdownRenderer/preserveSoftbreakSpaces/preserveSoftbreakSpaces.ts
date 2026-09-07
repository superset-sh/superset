import { Extension } from "@tiptap/core";

export function softbreakNewlineToSpace(
	text: string,
	options?: { followedByElement?: boolean },
): string {
	if (/^\n\S/.test(text)) {
		return ` ${text.slice(1)}`;
	}
	if (text === "\n" && options?.followedByElement) {
		return " ";
	}
	return text;
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

		const fixed = softbreakNewlineToSpace(text, {
			followedByElement: next.nextSibling?.nodeType === Node.ELEMENT_NODE,
		});
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
