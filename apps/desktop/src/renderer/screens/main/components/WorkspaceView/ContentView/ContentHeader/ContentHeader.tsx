import type { ReactNode } from "react";

interface ContentHeaderProps {
	/** Optional leading action (e.g., SidebarControl) */
	leadingAction?: ReactNode;
	/** Mode-specific header content (e.g., GroupStrip or file info) */
	children: ReactNode;
	/** Optional trailing action (e.g., WorkspaceControls) */
	trailingAction?: ReactNode;
}

export function ContentHeader({
	leadingAction,
	children,
	trailingAction,
}: ContentHeaderProps) {
	return (
		<div className="flex items-end bg-background shrink-0">
			{leadingAction && (
				<div className="flex items-center h-10 pl-2">{leadingAction}</div>
			)}
			<div className="flex-1 min-w-0">{children}</div>
			{trailingAction && (
				<div className="flex items-center h-10 pr-2">{trailingAction}</div>
			)}
		</div>
	);
}
