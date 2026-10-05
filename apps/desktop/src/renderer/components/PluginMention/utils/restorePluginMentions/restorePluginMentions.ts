import type { Editor } from "@tiptap/core";
import { PLUGIN_MENTION_NODE_NAME } from "../../PluginMentionNode";
import type { PluginMentionOption } from "../../types";

const HANDLE = /(^|\s)@([a-z0-9][a-z0-9.-]*)(?![\p{L}\p{M}\p{N}_])/gu;

interface Replacement {
	from: number;
	to: number;
	attrs: { name: string; label: string };
}

/**
 * Swaps handles that were read before the catalog loaded for chips: bare
 * `@name` text, and file chips restored from text whose path is a plugin
 * name. Each swap replaces exactly that range, so nothing else moves.
 */
export function restorePluginMentions(
	editor: Editor,
	resolvePlugin: (name: string) => PluginMentionOption | null,
): boolean {
	const type = editor.schema.nodes[PLUGIN_MENTION_NODE_NAME];
	if (!type) return false;
	const replacements: Replacement[] = [];

	editor.state.doc.descendants((node, pos) => {
		if (node.type.spec.code) return false;
		if (node.type.name === "file-mention") {
			const plugin =
				node.attrs.fromText === true
					? resolvePlugin(String(node.attrs.path))
					: null;
			if (plugin) {
				replacements.push({
					from: pos,
					to: pos + node.nodeSize,
					attrs: { name: plugin.name, label: plugin.displayName },
				});
			}
			return false;
		}
		if (!node.isText || !node.text) return;
		if (node.marks.some((mark) => mark.type.name === "code")) return;
		for (const match of node.text.matchAll(HANDLE)) {
			const name = (match[2] ?? "").replace(/[.-]+$/, "");
			const plugin = resolvePlugin(name);
			if (!plugin) continue;
			const from = pos + (match.index ?? 0) + (match[1]?.length ?? 0);
			replacements.push({
				from,
				to: from + 1 + name.length,
				attrs: { name: plugin.name, label: plugin.displayName },
			});
		}
	});

	if (replacements.length === 0) return false;
	const tr = editor.state.tr;
	for (const replacement of replacements.reverse()) {
		tr.replaceWith(
			replacement.from,
			replacement.to,
			type.create(replacement.attrs),
		);
	}
	editor.view.dispatch(tr);
	return true;
}
