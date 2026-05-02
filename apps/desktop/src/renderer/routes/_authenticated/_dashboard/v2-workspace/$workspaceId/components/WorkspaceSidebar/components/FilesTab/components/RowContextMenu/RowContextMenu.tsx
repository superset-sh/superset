import type { ContextMenuOpenContext } from "@pierre/trees";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";

interface RowContextMenuProps extends Record<string, unknown> {
	anchorRect: ContextMenuOpenContext["anchorRect"];
	onClose: () => void;
	children: React.ReactNode;
}

/**
 * Pierre invokes our renderContextMenu callback with the row's anchor rect on
 * right-click. We mount a controlled DropdownMenu whose invisible trigger sits
 * at that rect so radix handles positioning, outside-click, and focus escape.
 * The data-file-tree-context-menu-root attr (passed via {...attrs}) tells
 * Pierre that portaled clicks inside the menu are not "outside" clicks.
 */
export function RowContextMenu({
	anchorRect,
	onClose,
	children,
	...attrs
}: RowContextMenuProps) {
	return (
		<DropdownMenu open onOpenChange={(open) => !open && onClose()}>
			<DropdownMenuTrigger asChild>
				<span
					aria-hidden
					style={{
						position: "fixed",
						left: anchorRect.left,
						top: anchorRect.top,
						width: anchorRect.width,
						height: anchorRect.height,
						pointerEvents: "none",
					}}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent {...attrs} className="w-56" align="start">
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
