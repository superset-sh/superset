import type { ReactNode } from "react";

/**
 * Wraps full-pane workspace state screens (not-found, creating, host
 * incompatible, missing worktree, loading). On the v2 workspace route with an
 * expanded sidebar the TopBar is hidden and the pane tab bar — normally the
 * window-drag region — isn't rendered either, so these screens must provide
 * their own drag strip across the top. Overlaid (not in flow) so the centered
 * state content keeps its layout; the strip only covers empty background.
 */
export function StateScreenShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative h-full w-full">
			<div className="drag absolute inset-x-0 top-0 h-12" />
			{children}
		</div>
	);
}
