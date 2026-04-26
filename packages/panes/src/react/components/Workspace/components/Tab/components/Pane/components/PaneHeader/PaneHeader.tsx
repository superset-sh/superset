import { cn } from "@superset/ui/utils";
import { type ReactNode, useCallback, useRef } from "react";
import { useDrag } from "react-dnd";
import { DefaultHeaderContent } from "./components/DefaultHeaderContent";

interface PaneHeaderProps {
	title: ReactNode;
	icon?: ReactNode;
	isActive: boolean;
	titleContent?: ReactNode;
	headerExtras?: ReactNode;
	actionsContent: ReactNode;
	toolbar?: ReactNode;
	paneId?: string;
	onClick?: () => void;
	onMiddleClick?: () => void;
}

export const PANE_DRAG_TYPE = "pane";

export function PaneHeader({
	title,
	icon,
	isActive,
	titleContent,
	headerExtras,
	actionsContent,
	toolbar,
	paneId,
	onClick,
	onMiddleClick,
}: PaneHeaderProps) {
	const [{ isDragging }, connectDrag] = useDrag(
		() => ({
			type: PANE_DRAG_TYPE,
			item: { paneId },
			canDrag: !!paneId,
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[paneId],
	);

	const nodeRef = useRef<HTMLDivElement>(null);
	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			(nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
			connectDrag(node);
		},
		[connectDrag],
	);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pane header click-to-pin doesn't need keyboard equivalent
		// biome-ignore lint/a11y/noStaticElementInteractions: click to pin, middle-click to close
		<div
			ref={setRef}
			className={cn(
				"flex h-7 shrink-0 items-center transition-[background-color] duration-150 cursor-grab",
				isActive ? "bg-muted" : "bg-transparent",
				isDragging && "opacity-30",
			)}
			onClick={onClick}
			onAuxClick={(e) => {
				if (e.button === 1 && onMiddleClick) {
					e.preventDefault();
					onMiddleClick();
				}
			}}
		>
			{toolbar ?? (
				<DefaultHeaderContent
					title={title}
					icon={icon}
					isActive={isActive}
					titleContent={titleContent}
					headerExtras={headerExtras}
					actionsContent={actionsContent}
				/>
			)}
		</div>
	);
}
