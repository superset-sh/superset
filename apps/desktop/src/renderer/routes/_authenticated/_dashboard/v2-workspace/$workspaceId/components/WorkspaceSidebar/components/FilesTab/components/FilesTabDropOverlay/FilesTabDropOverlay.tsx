import { FileUp } from "lucide-react";
import type { FilesTabDropTarget } from "../../hooks/useFilesTabDrop";

interface FilesTabDropOverlayProps {
	/** The resolved drop destination — folder under the cursor, or root. */
	target: FilesTabDropTarget;
}

/**
 * Drop affordance shown while OS files are dragged over the Files tab. Highlights
 * the exact destination folder row under the cursor (or frames the whole tree
 * when dropping into the root), and names the target in a pinned chip. Rendered
 * as a non-interactive overlay so it never swallows the underlying drag events.
 */
export function FilesTabDropOverlay({ target }: FilesTabDropOverlayProps) {
	const { rect, label } = target;
	return (
		<div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
			{rect ? (
				<div
					className="absolute rounded-sm bg-primary/15 ring-2 ring-inset ring-primary"
					style={{
						top: rect.top,
						left: rect.left,
						width: rect.width,
						height: rect.height,
					}}
				/>
			) : (
				<div className="absolute inset-0 m-1 rounded-md border-2 border-dashed border-primary/60 bg-primary/5" />
			)}

			<div className="absolute inset-x-0 bottom-2 flex justify-center">
				<div className="flex max-w-[90%] items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
					<FileUp className="size-3.5 shrink-0" />
					<span className="truncate">Drop into {label}</span>
				</div>
			</div>
		</div>
	);
}
