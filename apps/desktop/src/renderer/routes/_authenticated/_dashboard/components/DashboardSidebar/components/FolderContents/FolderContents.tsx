import type { ReactNode } from "react";
import type { DashboardSidebarFolder } from "../../types";
import { hasCustomColor } from "../../utils/folderColor";

interface FolderContentsProps {
	folder: DashboardSidebarFolder;
	isSidebarCollapsed: boolean;
	children: ReactNode;
}

/**
 * Indented wrapper for a folder's projects. The rail marks where the folder's
 * contents end (so no divider is needed before the ungrouped list), tinted
 * with the folder colour when one is set. In the collapsed icon rail there are
 * no headers to nest under, so children render flush.
 */
export function FolderContents({
	folder,
	isSidebarCollapsed,
	children,
}: FolderContentsProps) {
	if (isSidebarCollapsed) return <>{children}</>;
	return (
		<div
			className="ml-4 border-l border-border/60 pl-1"
			// 8-digit hex: folder colour at ~30% alpha keeps the rail quiet.
			style={
				hasCustomColor(folder.color)
					? { borderColor: `${folder.color}4d` }
					: undefined
			}
		>
			{children}
		</div>
	);
}
