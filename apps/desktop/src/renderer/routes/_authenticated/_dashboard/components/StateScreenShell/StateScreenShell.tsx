import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";

/**
 * Wraps full-pane state screens (loading, not found, creating, and the like),
 * which have no header of their own. The header is overlaid so the centered
 * state content keeps its layout.
 */
export function StateScreenShell({ children }: { children?: ReactNode }) {
	return (
		<div className="relative h-full w-full">
			<PageHeader className="absolute inset-x-0 top-0 z-10" />
			{children}
		</div>
	);
}
