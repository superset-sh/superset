import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPanelLeft, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";
import { COLLAPSED_WORKSPACE_SIDEBAR_WIDTH } from "renderer/stores/workspace-sidebar-state";
import { usePrototypeStore } from "../../store/usePrototypeStore";

/**
 * Verbatim copy of the real sidebar's SidebarToggle (LuPanelLeft at rest,
 * close/open variant while hovered, right-side hotkey tooltip) rebound to the
 * prototype store. The ⌘B hotkey itself is registered on the prototype page.
 */
export function PrototypeSidebarToggle() {
	const collapsed = usePrototypeStore(
		(s) => s.sidebarWidth === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	);
	const toggleCollapsed = usePrototypeStore((s) => s.toggleSidebarCollapsed);

	const getToggleIcon = (isHovering: boolean) => {
		if (collapsed) {
			return isHovering ? (
				<LuPanelLeftOpen className="size-4" strokeWidth={1.5} />
			) : (
				<LuPanelLeft className="size-4" strokeWidth={1.5} />
			);
		}
		return isHovering ? (
			<LuPanelLeftClose className="size-4" strokeWidth={1.5} />
		) : (
			<LuPanelLeft className="size-4" strokeWidth={1.5} />
		);
	};

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggleCollapsed}
					className="no-drag group flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<HotkeyLabel label="Toggle sidebar" id="TOGGLE_WORKSPACE_SIDEBAR" />
			</TooltipContent>
		</Tooltip>
	);
}
