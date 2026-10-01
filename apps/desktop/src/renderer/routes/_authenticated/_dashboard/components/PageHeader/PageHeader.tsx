import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	useCollapsedSidebarBand,
	WINDOW_CHROME_BAND_CLASS,
	WindowChrome,
} from "../WindowChrome";
import { WindowControlsInset } from "../WindowControlsInset";

interface PageHeaderProps {
	start?: ReactNode;
	end?: ReactNode;
	/** The row itself: borders, position, background. */
	className?: string;
	/** The padded area after the window controls: padding and gaps. */
	contentClassName?: string;
	/** A row that lays out its own drag area, in place of `start` and `end`. */
	children?: ReactNode;
	/** False for a header with another header to its right, which keeps the Windows/Linux window controls clear instead. */
	reservesWindowControls?: boolean;
}

/** Every screen's header row. The space between `start` and `end` drags the window. */
export function PageHeader({
	start,
	end,
	className,
	contentClassName,
	children,
	reservesWindowControls = true,
}: PageHeaderProps) {
	const isBanded = useCollapsedSidebarBand();
	return (
		<header
			className={cn(
				"flex h-12 shrink-0 items-center",
				className,
				isBanded && WINDOW_CHROME_BAND_CLASS,
			)}
		>
			<WindowChrome />
			<div
				className={cn(
					"flex h-full min-w-0 flex-1 items-center gap-2 px-4",
					contentClassName,
				)}
			>
				{children ?? (
					<>
						{start}
						<div className="drag h-full min-w-0 flex-1" />
						{end}
					</>
				)}
				{reservesWindowControls && <WindowControlsInset />}
			</div>
		</header>
	);
}
