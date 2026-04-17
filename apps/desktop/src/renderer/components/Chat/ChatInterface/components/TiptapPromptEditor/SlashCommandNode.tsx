import { cn } from "@superset/ui/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";

function SlashCommandChip({
	node,
	selected,
	updateAttributes,
	editor,
	getPos,
}: NodeViewProps) {
	const name = node.attrs.name as string;
	const args = (node.attrs.args as string) ?? "";
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-focus the inline input when this chip is freshly inserted.
	// Only run on mount; by then the editor view still holds focus (the suggestion
	// plugin just committed the chip), so we can safely transfer focus into the input.
	useEffect(() => {
		inputRef.current?.focus();
		// Position cursor at end of any pre-filled args
		const len = inputRef.current?.value.length ?? 0;
		inputRef.current?.setSelectionRange(len, len);
	}, []); // mount-only

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			updateAttributes({ args: e.target.value });
		},
		[updateAttributes],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			// Tab or ArrowRight at the end of input → exit chip into the editor
			if (
				e.key === "Tab" ||
				(e.key === "ArrowRight" &&
					inputRef.current?.selectionStart === args.length)
			) {
				e.preventDefault();
				e.stopPropagation();
				const pos = getPos();
				if (pos !== undefined) {
					editor
						.chain()
						.focus()
						.setTextSelection(pos + node.nodeSize)
						.run();
				} else {
					editor.commands.focus("end");
				}
			}
			// Backspace on empty input → delete the chip and return focus to editor
			if (e.key === "Backspace" && args === "") {
				e.preventDefault();
				e.stopPropagation();
				const pos = getPos();
				if (pos !== undefined) {
					editor
						.chain()
						.focus()
						.deleteRange({ from: pos, to: pos + node.nodeSize })
						.run();
				}
			}
		},
		[args, editor, getPos, node.nodeSize],
	);

	const placeholder = name;
	// Size the input to its content, with a sensible minimum
	const displayWidth = Math.max(args.length, placeholder.length, 4);

	return (
		<NodeViewWrapper as="span" className="inline-block align-middle">
			<span
				contentEditable={false}
				className={cn(
					"inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-xs select-none transition-colors",
					selected ? "bg-muted-foreground/15" : "bg-muted-foreground/10",
				)}
			>
				<span className="text-muted-foreground">/</span>
				<span className="text-foreground/90">{name}</span>
				<span className="text-muted-foreground/60">:</span>
				<input
					ref={inputRef}
					className="bg-transparent border-none outline-none text-foreground/90 placeholder:text-muted-foreground/40 leading-none"
					style={{ width: `${displayWidth}ch` }}
					value={args}
					placeholder={placeholder}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					// Prevent ProseMirror from handling mouse events on the input
					onMouseDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
				/>
			</span>
		</NodeViewWrapper>
	);
}

export const SlashCommandNode = Node.create({
	name: "slash-command",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			name: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-name"),
				renderHTML: (attrs) => ({ "data-name": attrs.name }),
			},
			args: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-args") ?? "",
				renderHTML: (attrs) => (attrs.args ? { "data-args": attrs.args } : {}),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-type="slash-command"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes({ "data-type": "slash-command" }, HTMLAttributes),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(SlashCommandChip);
	},
});
