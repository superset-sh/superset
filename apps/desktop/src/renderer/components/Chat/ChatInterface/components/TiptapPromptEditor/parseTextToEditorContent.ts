import type { JSONContent } from "@tiptap/core";

/**
 * Matches file-mention tokens produced by serializeEditorToText.
 * Handles both @path/without/spaces and @"path with spaces".
 * Requires @ to appear at the start of the string or after whitespace so that
 * strings like "foo@bar.com" or "@decorator" mid-word are not rewritten.
 */
const MENTION_RE = /(?:^|(?<=\s))@(?:"([^"]+)"|(\S+))/g;

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

		let match: RegExpExecArray | null = MENTION_RE.exec(line);
		while (match !== null) {
			// Text before the mention
			if (match.index > lastIndex) {
				inlineNodes.push({
					type: "text",
					text: line.slice(lastIndex, match.index),
				});
			}
			// The file-mention node — group 1 = quoted path, group 2 = unquoted path
			inlineNodes.push({
				type: "file-mention",
				attrs: { path: match[1] ?? match[2] },
			});
			lastIndex = match.index + match[0].length;
			match = MENTION_RE.exec(line);
		}

		// Remaining text after the last mention
		if (lastIndex < line.length) {
			inlineNodes.push({ type: "text", text: line.slice(lastIndex) });
		}

		return { type: "paragraph", content: inlineNodes };
	});

	return { type: "doc", content: paragraphs };
}
