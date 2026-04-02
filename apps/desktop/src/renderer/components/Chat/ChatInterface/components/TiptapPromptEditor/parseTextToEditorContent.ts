import type { JSONContent } from "@tiptap/core";

/**
 * Regex that matches @mention tokens.
 * Captures the path after the @. We treat any non-whitespace sequence
 * following @ as a file-mention (the editor only produces these via the
 * mention picker, so there are no false-positive @ strings in practice).
 */
const MENTION_RE = /@(\S+)/g;

/**
 * Converts a plain-text string (as produced by serializeEditorToText) back
 * into a Tiptap JSONContent document, restoring file-mention atoms wherever
 * an @path token is found.
 */
export function parseTextToEditorContent(text: string): JSONContent {
	const paragraphs = text.split("\n").map((line): JSONContent => {
		if (line === "") {
			return { type: "paragraph" };
		}

		const inlineNodes: JSONContent[] = [];
		let lastIndex = 0;
		MENTION_RE.lastIndex = 0;

		let match: RegExpExecArray | null;
		while ((match = MENTION_RE.exec(line)) !== null) {
			// Text before the mention
			if (match.index > lastIndex) {
				inlineNodes.push({ type: "text", text: line.slice(lastIndex, match.index) });
			}
			// The file-mention node
			inlineNodes.push({ type: "file-mention", attrs: { path: match[1] } });
			lastIndex = match.index + match[0].length;
		}

		// Remaining text after the last mention
		if (lastIndex < line.length) {
			inlineNodes.push({ type: "text", text: line.slice(lastIndex) });
		}

		return { type: "paragraph", content: inlineNodes };
	});

	return { type: "doc", content: paragraphs };
}
