import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { type Editor, ReactRenderer } from "@tiptap/react";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
	RecordMentionList,
	type RecordMentionListRef,
} from "./components/RecordMentionList";
import type { RecordMentionItem, RecordMentionSearchFn } from "./types";

const recordMentionSuggestionKey = new PluginKey("markdownEditorRecordMention");

function toAttrs(item: RecordMentionItem) {
	switch (item.kind) {
		case "person":
			return { kind: "person", id: item.id, label: item.name };
		case "task":
			return { kind: "task", id: item.id, label: `${item.slug} ${item.title}` };
		case "pull_request":
			return {
				kind: "pull_request",
				id: item.url,
				label: `#${item.number} ${item.title}`,
			};
	}
}

export interface RecordMentionSuggestionOptions {
	searchMentions: RecordMentionSearchFn | null;
}

export const RecordMentionSuggestion =
	Extension.create<RecordMentionSuggestionOptions>({
		name: "recordMentionSuggestion",

		addOptions() {
			return { searchMentions: null };
		},

		addProseMirrorPlugins() {
			return [
				Suggestion({
					pluginKey: recordMentionSuggestionKey,
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

					items: async ({ query }): Promise<RecordMentionItem[]> => {
						const search = this.options.searchMentions;
						if (!search) return [];
						try {
							return await search(query);
						} catch (error) {
							console.error("[mention] search failed", error);
							return [];
						}
					},

					command: ({
						editor,
						range,
						props,
					}: {
						editor: Editor;
						range: { from: number; to: number };
						props: RecordMentionItem;
					}) => {
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContentAt(range.from, [
								{ type: "record-mention", attrs: toAttrs(props) },
								{ type: "text", text: " " },
							])
							.run();
					},

					render: () => {
						let component: ReactRenderer<
							RecordMentionListRef,
							SuggestionProps<RecordMentionItem>
						> | null = null;
						let popup: TippyInstance[] | null = null;

						return {
							onStart: (props: SuggestionProps<RecordMentionItem>) => {
								component = new ReactRenderer(RecordMentionList, {
									props,
									editor: props.editor,
								});
								if (!props.clientRect) return;
								const clientRect = props.clientRect;
								popup = tippy("body", {
									getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
									appendTo: () =>
										props.editor.view.dom.closest("[role=dialog]") ??
										document.body,
									content: component.element,
									showOnCreate: true,
									interactive: true,
									trigger: "manual",
									placement: "bottom-start",
								});
							},
							onUpdate: (props: SuggestionProps<RecordMentionItem>) => {
								component?.updateProps(props);
								if (!props.clientRect) return;
								const getClientRect = props.clientRect;
								popup?.[0]?.setProps({
									getReferenceClientRect: () =>
										getClientRect() ?? new DOMRect(),
								});
							},
							onKeyDown: (props: SuggestionKeyDownProps) => {
								if (props.event.key === "Escape") {
									props.event.preventDefault();
									props.event.stopPropagation();
									popup?.[0]?.hide();
									return true;
								}
								return component?.ref?.onKeyDown(props) ?? false;
							},
							onExit: () => {
								popup?.[0]?.destroy();
								component?.destroy();
							},
						};
					},
				}),
			];
		},
	});
