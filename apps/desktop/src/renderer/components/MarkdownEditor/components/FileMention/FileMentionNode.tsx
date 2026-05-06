import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { LuX } from "react-icons/lu";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

function FileMentionChip({ node, selected, deleteNode }: NodeViewProps) {
	const path = (node.attrs.path as string | null | undefined) ?? "";
	const broken = node.attrs.broken === true;
	const fileName = path.split("/").pop() || path;

	return (
		<NodeViewWrapper as="span" className="inline-block align-middle">
			<span
				contentEditable={false}
				title={path}
				className={cn(
					"mx-0.5 inline-flex items-center gap-1 rounded-sm border px-1 py-[1px] font-mono text-xs transition-colors",
					broken
						? "border-destructive/30 bg-destructive/10 text-destructive/80 line-through"
						: "border-border bg-muted text-foreground/90 hover:bg-muted/70",
					!broken && selected && "ring-1 ring-primary/40",
				)}
			>
				<FileIcon fileName={fileName} className="size-3 shrink-0" />
				<span
					className="inline-block max-w-[16rem] truncate align-bottom"
					style={{ direction: "rtl", textAlign: "left" }}
				>
					<bdi>{path}</bdi>
				</span>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={`Remove mention ${path}`}
							onMouseDown={(event) => {
								event.preventDefault();
							}}
							onClick={(event) => {
								event.stopPropagation();
								deleteNode();
							}}
							className="ml-0.5 inline-flex size-3.5 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
						>
							<LuX className="size-3" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">Remove mention</TooltipContent>
				</Tooltip>
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
			broken: {
				default: false,
				parseHTML: (el) => el.getAttribute("data-broken") === "true",
				renderHTML: (attrs) => (attrs.broken ? { "data-broken": "true" } : {}),
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

	renderText({ node }) {
		const path = (node.attrs.path as string | null | undefined) ?? "";
		return path.includes(" ") ? `@"${path}"` : `@${path}`;
	},

	addNodeView() {
		return ReactNodeViewRenderer(FileMentionChip);
	},
});
