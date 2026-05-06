import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { type Editor, ReactRenderer } from "@tiptap/react";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
	FileMentionList,
	type FileMentionListRef,
} from "./components/FileMentionList";
import type { FileMentionResult, FileMentionSearchFn } from "./types";

const fileMentionSuggestionKey = new PluginKey("markdownEditorFileMention");

export interface FileMentionSuggestionOptions {
	searchFiles: FileMentionSearchFn | null;
}

export const FileMentionSuggestion =
	Extension.create<FileMentionSuggestionOptions>({
		name: "fileMentionSuggestion",

		addOptions() {
			return {
				searchFiles: null,
			};
		},

		addProseMirrorPlugins() {
			return [
				Suggestion({
					pluginKey: fileMentionSuggestionKey,
					editor: this.editor,
					char: "@",
					allowSpaces: false,
					// Only trigger at start of block or after whitespace/atom
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

					items: async ({ query }): Promise<FileMentionResult[]> => {
						const search = this.options.searchFiles;
						if (!search) return [];
						if (query.length === 0) return [];
						try {
							return await search(query);
						} catch {
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
						props: FileMentionResult;
					}) => {
						editor
							.chain()
							.focus()
							.deleteRange(range)
							.insertContentAt(range.from, [
								{
									type: "file-mention",
									attrs: { path: props.relativePath, broken: false },
								},
								{ type: "text", text: " " },
							])
							.run();
					},

					render: () => {
						let component: ReactRenderer<
							FileMentionListRef,
							SuggestionProps<FileMentionResult>
						> | null = null;
						let popup: TippyInstance[] | null = null;

						return {
							onStart: (props: SuggestionProps<FileMentionResult>) => {
								component = new ReactRenderer(FileMentionList, {
									props,
									editor: props.editor,
								});

								if (!props.clientRect) return;

								const clientRect = props.clientRect;
								popup = tippy("body", {
									getReferenceClientRect: () => clientRect?.() ?? new DOMRect(),
									appendTo: () => document.body,
									content: component.element,
									showOnCreate: !!props.query,
									interactive: true,
									trigger: "manual",
									placement: "bottom-start",
								});
							},
							onUpdate: (props: SuggestionProps<FileMentionResult>) => {
								component?.updateProps(props);
								if (!props.clientRect) return;
								const getClientRect = props.clientRect;
								popup?.[0]?.setProps({
									getReferenceClientRect: () =>
										getClientRect() ?? new DOMRect(),
								});
								if (props.query) popup?.[0]?.show();
								else popup?.[0]?.hide();
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
