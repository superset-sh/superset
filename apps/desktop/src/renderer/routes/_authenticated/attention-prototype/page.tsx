import { createFileRoute, Link } from "@tanstack/react-router";
import { env } from "renderer/env.renderer";
import { useHotkey } from "renderer/hotkeys";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel/ResizablePanel";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
} from "renderer/stores/workspace-sidebar-state";
import { AttentionHud } from "./components/AttentionHud/AttentionHud";
import { PrototypeSidebar } from "./components/PrototypeSidebar/PrototypeSidebar";
import { PrototypeTopBar } from "./components/PrototypeTopBar/PrototypeTopBar";
import { SimulationDriver } from "./components/SimulationDriver/SimulationDriver";
import { useAttentionHudHotkey } from "./hooks/useAttentionHudHotkey";
import { usePrototypeStore } from "./store/usePrototypeStore";

export const Route = createFileRoute("/_authenticated/attention-prototype/")({
	component: AttentionPrototypePage,
});

function AttentionPrototypePage() {
	// Dev-only surface. Follows the repo pattern of env.NODE_ENV gating rather
	// than a route-level guard (the route tree is static).
	if (env.NODE_ENV !== "development") {
		return (
			<div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
				<div className="max-w-sm text-center">
					<p>This prototype is only available in development builds.</p>
					<Link to="/" className="mt-2 inline-block text-foreground underline">
						Back to app
					</Link>
				</div>
			</div>
		);
	}

	return <AttentionPrototypeContent />;
}

function AttentionPrototypeContent() {
	useAttentionHudHotkey();
	const sidebarWidth = usePrototypeStore((s) => s.sidebarWidth);
	const setSidebarWidth = usePrototypeStore((s) => s.setSidebarWidth);
	const sidebarResizing = usePrototypeStore((s) => s.sidebarResizing);
	const setSidebarResizing = usePrototypeStore((s) => s.setSidebarResizing);
	const toggleSidebarCollapsed = usePrototypeStore(
		(s) => s.toggleSidebarCollapsed,
	);
	// The route isn't under the _dashboard layout, so the real ⌘B registration
	// isn't active here — bind it to the prototype's own sidebar instead.
	useHotkey("TOGGLE_WORKSPACE_SIDEBAR", toggleSidebarCollapsed);

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			{/* Same panel + props as the real dashboard sidebar: raw drag widths go
			    to the store (clampWidth off), which snaps below 120px to the 52px
			    rail and clamps the expanded range to [220, 400]. Double-click the
			    handle to restore the 280px default. */}
			<ResizablePanel
				width={sidebarWidth}
				onWidthChange={setSidebarWidth}
				isResizing={sidebarResizing}
				onResizingChange={setSidebarResizing}
				minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
				maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
				handleSide="right"
				clampWidth={false}
				onDoubleClickHandle={() =>
					setSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
				}
			>
				<PrototypeSidebar />
			</ResizablePanel>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<PrototypeTopBar />
				<SimulationDriver />
			</div>
			<AttentionHud />
		</div>
	);
}
