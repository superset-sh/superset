import type { Editor } from "@tiptap/core";
import {
	needsSeparatorAfterMention,
	PLUGIN_MENTION_NODE_NAME,
	type PluginMentionOption,
	pluginMentionText,
} from "renderer/components/PluginMention";

/**
 * Serializes Tiptap editor content to plain text for submission.
 * FileMentionNode atoms → "@path", PluginMentionNode atoms → "@name",
 * text nodes → text, hardBreaks → "\n", block-level nodes separated by "\n".
 * A picked file whose path spells a plugin name is quoted so it reads back as
 * a file; a bare token restored from text stays bare so the text never drifts.
 */
export function serializeEditorToText(
	editor: Editor,
	plugins: readonly PluginMentionOption[] = [],
): string {
	const lines: string[] = [];

	editor.state.doc.forEach((blockNode) => {
		const parts: string[] = [];

		blockNode.forEach((child, _offset, index) => {
			if (child.type.name === "file-mention") {
				const p = child.attrs.path as string;
				const quote =
					p.includes(" ") ||
					(child.attrs.fromText !== true &&
						plugins.some((plugin) => plugin.name === p));
				parts.push(quote ? `@"${p}"` : `@${p}`);
			} else if (child.type.name === PLUGIN_MENTION_NODE_NAME) {
				const handle = pluginMentionText(child.attrs.name as string);
				parts.push(
					needsSeparatorAfterMention(blockNode, index) ? `${handle} ` : handle,
				);
			} else if (child.type.name === "slash-command") {
				const cmdName = child.attrs.name as string;
				const cmdArgs = (child.attrs.args as string) ?? "";
				parts.push(cmdArgs ? `/${cmdName} ${cmdArgs}` : `/${cmdName}`);
			} else if (child.type.name === "hardBreak") {
				parts.push("\n");
			} else if (child.isText) {
				parts.push(child.text ?? "");
			}
		});

		lines.push(parts.join(""));
	});

	return lines.join("\n");
}
