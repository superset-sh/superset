import { useDroppable } from "@dnd-kit/core";
import type React from "react";

interface DroppableMainContentProps {
	children: React.ReactNode;
	isOver: boolean;
}

/**
 * Droppable wrapper for main content area
 */
export function DroppableMainContent({
	children,
	isOver,
}: DroppableMainContentProps) {
	const { setNodeRef } = useDroppable({
		id: "main-content-drop-zone",
		data: {
			type: "main-content",
		},
	});

	return (
		<div
			ref={setNodeRef}
			className={`flex-1 overflow-hidden m-1 rounded-lg relative ${
				isOver ? "ring-2 ring-blue-500 ring-inset" : ""
			}`}
		>
			{children}
			{isOver && (
				<div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
					<div className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
						Drop to add to split view
					</div>
				</div>
			)}
		</div>
	);
}

