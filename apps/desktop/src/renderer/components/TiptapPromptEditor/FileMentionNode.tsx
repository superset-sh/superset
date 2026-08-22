import { cn } from "@superset/ui/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";

function FileMentionChip({ node, selected }: NodeViewProps) {
	const path = (node.attrs.path as string | null | undefined) ?? "";
	const name = path.split("/").pop() || path || "@";

	return (
		<NodeViewWrapper as="span" className="inline-block align-middle">
			<span
				contentEditable={false}
				className={cn(
					"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs text-foreground/90 select-none cursor-default transition-colors",
					selected ? "bg-muted-foreground/15" : "bg-muted-foreground/10",
				)}
			>
				<span className="text-muted-foreground">@</span>
				<span>{name}</span>
			</span>
		</NodeViewWrapper>
	);
}

export const FileMentionNode = Node.create({
	name: "file-mention",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			path: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-path"),
				renderHTML: (attrs) => ({ "data-path": attrs.path }),
			},
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-type="file-mention"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes({ "data-type": "file-mention" }, HTMLAttributes),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(FileMentionChip);
	},
});
