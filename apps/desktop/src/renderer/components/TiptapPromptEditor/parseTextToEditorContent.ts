import type { JSONContent } from "@tiptap/core";
import {
	PLUGIN_MENTION_NODE_NAME,
	type PluginMentionOption,
} from "renderer/components/PluginMention";

/**
 * Matches file-mention tokens produced by serializeEditorToText.
 * Handles both @path/without/spaces and @"path with spaces".
 * Requires @ to appear at the start of the string or after whitespace so that
 * strings like "foo@bar.com" or "@decorator" mid-word are not rewritten.
 */
const MENTION_RE = /(?:^|(?<=\s))@(?:"([^"]+)"|(\S+))/g;

const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

/**
 * Converts a plain-text string (as produced by serializeEditorToText) back
 * into a Tiptap JSONContent document, restoring file-mention atoms wherever
 * an @path token is found. An unquoted token naming one of `plugins` is a
 * plugin mention instead.
 */
export function parseTextToEditorContent(
	text: string,
	plugins: readonly PluginMentionOption[] = [],
): JSONContent {
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
			// group 1 = quoted path, group 2 = unquoted path or plugin handle
			const quotedPath = match[1];
			const token = quotedPath ?? match[2] ?? "";
			const handle =
				quotedPath === undefined ? token.replace(TRAILING_PUNCTUATION, "") : "";
			const plugin = plugins.find((candidate) => candidate.name === handle);
			if (plugin) {
				inlineNodes.push({
					type: PLUGIN_MENTION_NODE_NAME,
					attrs: { name: plugin.name, label: plugin.displayName },
				});
				const punctuation = token.slice(handle.length);
				if (punctuation) inlineNodes.push({ type: "text", text: punctuation });
			} else {
				inlineNodes.push({
					type: "file-mention",
					attrs: { path: token, fromText: quotedPath === undefined },
				});
			}
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
