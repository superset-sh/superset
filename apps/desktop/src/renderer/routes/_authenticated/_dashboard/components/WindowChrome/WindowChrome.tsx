import { cn } from "@superset/ui/utils";
import { ZoomStable } from "renderer/components/ZoomStable";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { COLLAPSED_WORKSPACE_SIDEBAR_WIDTH } from "renderer/stores/workspace-sidebar-state";
import { NavigationControls } from "../NavigationControls";
import { OfflineBadge } from "../OfflineBadge";
import { PortsDropdown } from "../PortsDropdown";
import { SidebarToggle } from "../SidebarToggle";
import {
	WINDOW_CONTROLS_ROW_HEIGHT,
	WINDOW_CONTROLS_ROW_TOP,
} from "./constants";
import { useWindowChromeVisible } from "./hooks/useWindowChromeVisible";

const TRAFFIC_LIGHTS_WIDTH = 80;

/**
 * The window controls, when the sidebar is collapsed to its rail and cannot
 * hold them. The macOS window buttons overhang the rail into this header.
 */
export function WindowChrome({ className }: { className?: string }) {
	const isVisible = useWindowChromeVisible();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();

	if (!isVisible) return null;
	return (
		<div className={cn("flex h-full shrink-0 self-start", className)}>
			{isMac && (
				<div
					className="drag h-full shrink-0"
					style={{
						width: `${Math.max(TRAFFIC_LIGHTS_WIDTH / zoomFactor - COLLAPSED_WORKSPACE_SIDEBAR_WIDTH, 0)}px`,
					}}
				/>
			)}
			<div
				className="flex shrink-0 items-center"
				style={{
					marginTop: `${WINDOW_CONTROLS_ROW_TOP / (isMac ? zoomFactor : 1)}px`,
					height: `${WINDOW_CONTROLS_ROW_HEIGHT / (isMac ? zoomFactor : 1)}px`,
				}}
			>
				<ZoomStable enabled={isMac} className="flex items-center gap-1">
					<SidebarToggle />
					<NavigationControls />
					<PortsDropdown align="start" />
					<OfflineBadge />
				</ZoomStable>
			</div>
		</div>
	);
}
