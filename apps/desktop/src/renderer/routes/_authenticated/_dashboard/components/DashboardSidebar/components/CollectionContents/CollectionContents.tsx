import type { ReactNode } from "react";
import type { DashboardSidebarCollection } from "../../types";
import { hasCustomColor } from "../../utils/collectionColor";

interface CollectionContentsProps {
	collection: DashboardSidebarCollection;
	isSidebarCollapsed: boolean;
	children: ReactNode;
}

/**
 * Indented wrapper for a collection's projects. The rail marks where the collection's
 * contents end (so no divider is needed before the ungrouped list), tinted
 * with the collection colour when one is set. In the collapsed icon rail there are
 * no headers to nest under, so children render flush.
 */
export function CollectionContents({
	collection,
	isSidebarCollapsed,
	children,
}: CollectionContentsProps) {
	if (isSidebarCollapsed) return <>{children}</>;
	return (
		<div
			className="ml-4 border-l border-border/60 pl-1"
			// 8-digit hex: collection colour at ~30% alpha keeps the rail quiet.
			style={
				hasCustomColor(collection.color)
					? { borderColor: `${collection.color}4d` }
					: undefined
			}
		>
			{children}
		</div>
	);
}
