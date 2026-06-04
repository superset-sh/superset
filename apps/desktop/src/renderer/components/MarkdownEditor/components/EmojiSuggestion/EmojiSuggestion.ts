import { Emoji, type EmojiItem, emojis } from "@tiptap/extension-emoji";
import { ReactRenderer } from "@tiptap/react";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
	EmojiSuggestionList,
	type EmojiSuggestionListRef,
} from "./components/EmojiSuggestionList";

const MAX_RESULTS = 10;

function matchEmoji(item: EmojiItem, query: string): boolean {
	const q = query.toLowerCase();
	return (
		item.shortcodes.some((s) => s.toLowerCase().includes(q)) ||
		item.tags.some((t) => t.toLowerCase().includes(q)) ||
		item.name.toLowerCase().includes(q)
	);
}

export const EmojiSuggestion = Emoji.configure({
	enableEmoticons: true,
	emojis,
	suggestion: {
		items: ({ query }) => {
			// Require at least 1 character — otherwise the first items in the
			// emojibase list are regional indicators (A–Z flag-building chars),
			// which aren't useful defaults.
			if (!query) return [];
			return emojis
				.filter((item) => matchEmoji(item, query))
				.slice(0, MAX_RESULTS);
		},
		// Override the default command, which appends an extra " " after the emoji.
		command: ({ editor, range, props }) => {
			editor
				.chain()
				.focus()
				.insertContentAt(range, {
					type: "emoji",
					attrs: props,
				})
				.run();
		},
		render: () => {
			let component: ReactRenderer<
				EmojiSuggestionListRef,
				SuggestionProps<EmojiItem>
			> | null = null;
			let popup: TippyInstance[] | null = null;

			return {
				onStart: (props: SuggestionProps<EmojiItem>) => {
					component = new ReactRenderer(EmojiSuggestionList, {
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
				onUpdate: (props: SuggestionProps<EmojiItem>) => {
					component?.updateProps(props);
					if (!props.clientRect) return;
					const getClientRect = props.clientRect;
					popup?.[0]?.setProps({
						getReferenceClientRect: () => getClientRect() ?? new DOMRect(),
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
	},
});
