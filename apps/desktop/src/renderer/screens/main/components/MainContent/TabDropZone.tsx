import { useDrop } from "react-dnd";
import type { Tab } from "shared/types";

type DropPosition = "top" | "right" | "bottom" | "left" | "center";

interface TabDropZoneProps {
	onDrop: (
		droppedTab: Tab,
		worktreeId: string,
		workspaceId: string,
		position: DropPosition,
	) => void;
	isActive?: boolean;
}

interface DragItem {
	tab: Tab;
	worktreeId: string;
	workspaceId?: string;
}

interface CollectedProps {
	isOver: boolean;
	canDrop: boolean;
}

export function TabDropZone({ onDrop, isActive = true }: TabDropZoneProps) {
	const [{ isOver: isOverTop, canDrop: canDropTop }, dropTopRef] = useDrop<
		DragItem,
		unknown,
		CollectedProps
	>({
		accept: "TAB",
		drop: (item: DragItem) => {
			onDrop(item.tab, item.worktreeId, item.workspaceId || "", "top");
		},
		canDrop: () => isActive,
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const [{ isOver: isOverRight, canDrop: canDropRight }, dropRightRef] = useDrop<
		DragItem,
		unknown,
		CollectedProps
	>({
		accept: "TAB",
		drop: (item: DragItem) => {
			onDrop(item.tab, item.worktreeId, item.workspaceId || "", "right");
		},
		canDrop: () => isActive,
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const [{ isOver: isOverBottom, canDrop: canDropBottom }, dropBottomRef] = useDrop<
		DragItem,
		unknown,
		CollectedProps
	>({
		accept: "TAB",
		drop: (item: DragItem) => {
			onDrop(item.tab, item.worktreeId, item.workspaceId || "", "bottom");
		},
		canDrop: () => isActive,
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const [{ isOver: isOverLeft, canDrop: canDropLeft }, dropLeftRef] = useDrop<
		DragItem,
		unknown,
		CollectedProps
	>({
		accept: "TAB",
		drop: (item: DragItem) => {
			onDrop(item.tab, item.worktreeId, item.workspaceId || "", "left");
		},
		canDrop: () => isActive,
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const [{ isOver: isOverCenter, canDrop: canDropCenter }, dropCenterRef] = useDrop<
		DragItem,
		unknown,
		CollectedProps
	>({
		accept: "TAB",
		drop: (item: DragItem) => {
			onDrop(item.tab, item.worktreeId, item.workspaceId || "", "center");
		},
		canDrop: () => isActive,
		collect: (monitor) => ({
			isOver: monitor.isOver(),
			canDrop: monitor.canDrop(),
		}),
	});

	const showOverlay = canDropTop || canDropRight || canDropBottom || canDropLeft || canDropCenter;

	if (!showOverlay) {
		return null;
	}

	return (
		<div className="absolute inset-0 pointer-events-none z-50">
			{/* Top drop zone */}
			<div
				ref={dropTopRef as any}
				className="absolute top-0 left-0 right-0 h-1/4 pointer-events-auto"
			>
				{isOverTop && canDropTop && (
					<div className="absolute inset-0 bg-blue-500/30 border-2 border-blue-500 rounded-md m-2 flex items-center justify-center">
						<div className="text-blue-200 font-semibold text-sm">Split Top</div>
					</div>
				)}
			</div>

			{/* Right drop zone */}
			<div
				ref={dropRightRef as any}
				className="absolute top-1/4 right-0 bottom-1/4 w-1/4 pointer-events-auto"
			>
				{isOverRight && canDropRight && (
					<div className="absolute inset-0 bg-blue-500/30 border-2 border-blue-500 rounded-md m-2 flex items-center justify-center">
						<div className="text-blue-200 font-semibold text-sm">Split Right</div>
					</div>
				)}
			</div>

			{/* Bottom drop zone */}
			<div
				ref={dropBottomRef as any}
				className="absolute bottom-0 left-0 right-0 h-1/4 pointer-events-auto"
			>
				{isOverBottom && canDropBottom && (
					<div className="absolute inset-0 bg-blue-500/30 border-2 border-blue-500 rounded-md m-2 flex items-center justify-center">
						<div className="text-blue-200 font-semibold text-sm">Split Bottom</div>
					</div>
				)}
			</div>

			{/* Left drop zone */}
			<div
				ref={dropLeftRef as any}
				className="absolute top-1/4 left-0 bottom-1/4 w-1/4 pointer-events-auto"
			>
				{isOverLeft && canDropLeft && (
					<div className="absolute inset-0 bg-blue-500/30 border-2 border-blue-500 rounded-md m-2 flex items-center justify-center">
						<div className="text-blue-200 font-semibold text-sm">Split Left</div>
					</div>
				)}
			</div>

			{/* Center drop zone */}
			<div
				ref={dropCenterRef as any}
				className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4 pointer-events-auto"
			>
				{isOverCenter && canDropCenter && (
					<div className="absolute inset-0 bg-green-500/30 border-2 border-green-500 rounded-md m-2 flex items-center justify-center">
						<div className="text-green-200 font-semibold text-sm">Replace</div>
					</div>
				)}
			</div>
		</div>
	);
}
