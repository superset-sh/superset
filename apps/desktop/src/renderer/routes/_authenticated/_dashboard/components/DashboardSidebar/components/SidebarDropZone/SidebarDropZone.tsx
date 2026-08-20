import { useDroppable } from "@dnd-kit/core";
import { cn } from "@superset/ui/utils";

interface SidebarDropZoneProps {
	dropZoneId: string;
	label: string;
}

/**
 * Container-level drop target for containers with no rows to hit. Kept as a
 * leaf component on purpose: useDroppable subscribes to dnd-kit's internal
 * context, which updates on every pointer move — hosting it in a section
 * component would re-render that whole section per move.
 */
export function SidebarDropZone({ dropZoneId, label }: SidebarDropZoneProps) {
	const { setNodeRef, isOver } = useDroppable({ id: dropZoneId });

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"mx-2 flex h-8 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground",
				isOver && "border-ring bg-fill-hover",
			)}
		>
			{label}
		</div>
	);
}
