import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { LuArrowLeft } from "react-icons/lu";
import { COLLAPSED_WORKSPACE_SIDEBAR_WIDTH } from "renderer/stores/workspace-sidebar-state";
import { usePrototypeStore } from "../../store/usePrototypeStore";
import { PrototypeSidebarToggle } from "../PrototypeSidebarToggle/PrototypeSidebarToggle";

/**
 * Always-on header bar over the page content, mirroring the real TopBar: the
 * expanded sidebar hosts the traffic-light pad + toggle, but once the sidebar
 * collapses to the 52px rail (too narrow for the pad), the pad and toggle move
 * here — so the macOS window controls never sit on top of the page title.
 */
export function PrototypeTopBar() {
	const sidebarCollapsed = usePrototypeStore(
		(s) => s.sidebarWidth === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	);

	return (
		// h-12 matches the real TopBar (and the sidebar's traffic-light strip).
		<div
			className={cn(
				"drag flex h-12 shrink-0 items-center gap-1.5 border-border border-b bg-muted/45 dark:bg-muted/35",
				// 28px + the 52px rail puts the toggle at the same 80px
				// traffic-light inset the expanded sidebar uses.
				sidebarCollapsed ? "pl-7" : "pl-5",
			)}
		>
			{sidebarCollapsed && <PrototypeSidebarToggle />}
			<span className="font-semibold text-foreground text-sm">
				Attention prototype
			</span>
			{/* The prototype route is full-screen, so this is the only way back
			    into the real app (the persisted router history restores this
			    route on every launch until you leave it). */}
			<Link
				to="/"
				className="no-drag ml-auto mr-4 flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
			>
				<LuArrowLeft className="size-3.5" />
				Back to app
			</Link>
		</div>
	);
}
