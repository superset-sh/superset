import { useDragLayer } from "react-dnd";

export function MultiDragPreview() {
	const drag = useDragLayer((monitor) => {
		if (!monitor.isDragging()) return null;
		const item = monitor.getItem();
		if (!item?.selectedIds || item.selectedIds.length <= 1) return null;
		const offset = monitor.getClientOffset();
		if (!offset) return null;
		return { offset, count: item.selectedIds.length };
	});

	if (!drag) return null;

	return (
		<div
			className="fixed pointer-events-none z-50"
			style={{
				left: drag.offset.x + 12,
				top: drag.offset.y - 12,
			}}
		>
			<div className="bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded-full shadow-md">
				{drag.count} workspaces
			</div>
		</div>
	);
}
