import { type Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
	exitSuggestion,
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import {
	matchPluginMentions,
	PLUGIN_MENTION_NODE_NAME,
	type PluginMentionOption,
} from "renderer/components/PluginMention";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
	PluginMentionList,
	type PluginMentionListRef,
} from "./components/PluginMentionList";

const pluginMentionSuggestionKey = new PluginKey("markdownEditorPluginMention");

const EXTENSION_NAME = "pluginMentionSuggestion";

export interface PluginMentionSuggestionOptions {
	getPlugins: () => readonly PluginMentionOption[];
}

interface PluginMentionSuggestionStorage {
	open: boolean;
}

/**
 * Whether the mention list is showing matches, so a composer's Enter-to-submit
 * handler can leave the key to the list.
 */
export function isPluginMentionMenuOpen(editor: Editor | null): boolean {
	const storage = (editor?.storage as Record<string, unknown> | undefined)?.[
		EXTENSION_NAME
	] as PluginMentionSuggestionStorage | undefined;
	return storage?.open === true;
}

export const PluginMentionSuggestion = Extension.create<
	PluginMentionSuggestionOptions,
	PluginMentionSuggestionStorage
>({
	name: EXTENSION_NAME,

	addOptions() {
		return { getPlugins: () => [] };
	},

	addStorage() {
		return { open: false };
	},

	addProseMirrorPlugins() {
		const storage = this.storage;
		return [
			Suggestion({
				pluginKey: pluginMentionSuggestionKey,
				editor: this.editor,
				char: "@",
				allowSpaces: false,
				allow: ({ state, range }) => {
					const $pos = state.doc.resolve(range.from);
					if ($pos.parentOffset === 0) return true;
					const before = $pos.parent.textBetween(
						0,
						$pos.parentOffset,
						"\0",
						" ",
					);
					const charBefore = before.slice(-1);
					return charBefore === " " || charBefore === "\n";
				},

				items: ({ query }): PluginMentionOption[] =>
					matchPluginMentions(this.options.getPlugins(), query),

				command: ({
					editor,
					range,
					props,
				}: {
					editor: Editor;
					range: { from: number; to: number };
					props: PluginMentionOption;
				}) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertContentAt(range.from, [
							{
								type: PLUGIN_MENTION_NODE_NAME,
								attrs: { name: props.name, label: props.displayName },
							},
							{ type: "text", text: " " },
						])
						.run();
				},

				render: () => {
					let component: ReactRenderer<
						PluginMentionListRef,
						SuggestionProps<PluginMentionOption>
					> | null = null;
					let popup: TippyInstance[] | null = null;
					let editor: Editor | null = null;
					// Ends the session, not just the popup: a hidden list must not
					// keep swallowing Enter or come back on the next keystroke.
					const dismiss = () => {
						storage.open = false;
						if (editor) exitSuggestion(editor.view, pluginMentionSuggestionKey);
					};

					return {
						onStart: (props: SuggestionProps<PluginMentionOption>) => {
							storage.open = props.items.length > 0;
							component = new ReactRenderer(PluginMentionList, {
								props,
								editor: props.editor,
							});
							editor = props.editor;
							editor.on("blur", dismiss);
							if (!props.clientRect) return;
							const clientRect = props.clientRect;
							popup = tippy("body", {
								getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
								appendTo: () =>
									props.editor.view.dom.closest("[role=dialog]") ??
									document.body,
								content: component.element,
								showOnCreate: props.items.length > 0,
								interactive: true,
								trigger: "manual",
								placement: "top-start",
							});
						},
						onUpdate: (props: SuggestionProps<PluginMentionOption>) => {
							storage.open = props.items.length > 0;
							component?.updateProps(props);
							if (!props.clientRect) return;
							const getClientRect = props.clientRect;
							popup?.[0]?.setProps({
								getReferenceClientRect: () => getClientRect() ?? new DOMRect(),
							});
							if (props.items.length > 0) popup?.[0]?.show();
							else popup?.[0]?.hide();
						},
						onKeyDown: (props: SuggestionKeyDownProps) => {
							if (props.event.key === "Escape") {
								props.event.preventDefault();
								props.event.stopPropagation();
								dismiss();
								return true;
							}
							return component?.ref?.onKeyDown(props) ?? false;
						},
						onExit: () => {
							storage.open = false;
							editor?.off("blur", dismiss);
							popup?.[0]?.destroy();
							component?.destroy();
						},
					};
				},
			}),
		];
	},
});
