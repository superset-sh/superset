import { cn } from "@superset/ui/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { PluginIcon } from "renderer/components/PluginIcon";
import type { PluginMentionOption } from "./types";

export const PLUGIN_MENTION_NODE_NAME = "plugin-mention";

/**
 * What the agent receives for a mention. The manifest name is the handle a
 * plugin's tools and skills answer to, so it is the whole message.
 */
export function pluginMentionText(name: string): string {
	return `@${name}`;
}

const MENTION_TOKEN = /^@([a-z0-9][a-z0-9.-]*)(?![\p{L}\p{M}\p{N}_])/u;

const WORD_START = /^[\p{L}\p{N}_]/u;

/**
 * Text that must not touch a handle: `@linearfile` is a different handle, so
 * every serializer puts a space between a chip and a following word.
 */
export function needsSeparatorAfterMention(
	parent: ProseMirrorNode | null | undefined,
	index: number,
): boolean {
	const next = parent?.maybeChild(index + 1);
	return next?.isText === true && WORD_START.test(next.text ?? "");
}

const spacingKey = new PluginKey("pluginMentionSpacing");

export interface PluginMentionNodeOptions {
	/** Decides which `@name` tokens become mentions when markdown is read back. */
	resolvePlugin: (name: string) => PluginMentionOption | null;
}

type InlineState = {
	src: string;
	pos: number;
	posMax: number;
	push: (type: string, tag: string, nesting: number) => { content: string };
};

type InlineRule = (state: InlineState, silent: boolean) => boolean;

type MarkdownItLike = {
	inline: { ruler: { push: (name: string, rule: InlineRule) => void } };
};

const HTML_ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
};

const escapeAttribute = (text: string) =>
	text.replace(/[&<>"]/g, (char) => HTML_ENTITIES[char] ?? char);

// tiptap-markdown re-runs parse.setup on every parse; the rule must be added once.
const preparedParsers = new WeakSet<object>();

function pluginMentionRule(
	resolvePlugin: PluginMentionNodeOptions["resolvePlugin"],
): InlineRule {
	return (state, silent) => {
		if (state.src.charCodeAt(state.pos) !== 0x40) return false;
		const before = state.pos === 0 ? " " : (state.src[state.pos - 1] ?? " ");
		if (!/\s/.test(before)) return false;
		const match = MENTION_TOKEN.exec(state.src.slice(state.pos, state.posMax));
		if (!match?.[1]) return false;
		const name = match[1].replace(/[.-]+$/, "");
		const plugin = resolvePlugin(name);
		if (!plugin) return false;
		if (!silent) {
			const token = state.push("html_inline", "", 0);
			token.content = `<span data-type="${PLUGIN_MENTION_NODE_NAME}" data-plugin="${escapeAttribute(name)}" data-label="${escapeAttribute(plugin.displayName)}"></span>`;
		}
		state.pos += 1 + name.length;
		return true;
	};
}

function PluginMentionChip({ node, selected }: NodeViewProps) {
	const name = String(node.attrs.name ?? "");
	const label = String(node.attrs.label || name);

	// Inline and baseline-aligned with no vertical padding, so the chip never
	// grows the line box and the caret beside it stays text height.
	return (
		<NodeViewWrapper as="span" className="inline">
			<span
				contentEditable={false}
				title={pluginMentionText(name)}
				className={cn(
					"mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-sm px-1 align-bottom font-medium text-primary select-none",
					selected && "bg-accent",
				)}
			>
				<PluginIcon
					pluginName={name}
					className="size-3.5 self-center rounded-[3px]"
				/>
				<span className="max-w-[16rem] truncate">{label}</span>
			</span>
		</NodeViewWrapper>
	);
}

export const PluginMentionNode = Node.create<PluginMentionNodeOptions>({
	name: PLUGIN_MENTION_NODE_NAME,
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addOptions() {
		return { resolvePlugin: () => null };
	},

	addAttributes() {
		return {
			name: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-plugin"),
				renderHTML: (attrs) => ({ "data-plugin": attrs.name }),
			},
			label: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-label") ?? "",
				renderHTML: (attrs) => ({ "data-label": attrs.label }),
			},
		};
	},

	parseHTML() {
		return [{ tag: `span[data-type="${PLUGIN_MENTION_NODE_NAME}"]` }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(
				{ "data-type": PLUGIN_MENTION_NODE_NAME },
				HTMLAttributes,
			),
			pluginMentionText(String(node.attrs.name ?? "")),
		];
	},

	renderText({ node, parent, index }) {
		const text = pluginMentionText(String(node.attrs.name ?? ""));
		return needsSeparatorAfterMention(parent, index) ? `${text} ` : text;
	},

	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (text: string) => void },
					node: ProseMirrorNode,
					parent: ProseMirrorNode,
					index: number,
				) {
					const text = pluginMentionText(String(node.attrs.name ?? ""));
					state.write(
						needsSeparatorAfterMention(parent, index) ? `${text} ` : text,
					);
				},
				parse: {
					setup(
						this: { options: PluginMentionNodeOptions },
						md: MarkdownItLike,
					) {
						if (preparedParsers.has(md)) return;
						preparedParsers.add(md);
						md.inline.ruler.push(
							"plugin_mention",
							pluginMentionRule((name) => this.options.resolvePlugin(name)),
						);
					},
				},
			},
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(PluginMentionChip);
	},

	// Markdown drops the space after a trailing chip, so a word typed right
	// behind one would serialize glued to the handle (`@linearfile`).
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: spacingKey,
				props: {
					handleTextInput(view, from, to, text) {
						if (!WORD_START.test(text)) return false;
						const $from = view.state.doc.resolve(from);
						if ($from.nodeBefore?.type.name !== PLUGIN_MENTION_NODE_NAME) {
							return false;
						}
						view.dispatch(view.state.tr.insertText(` ${text}`, from, to));
						return true;
					},
				},
			}),
		];
	},
});
