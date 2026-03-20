import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	LuPanelLeft,
	LuPanelLeftClose,
	LuPanelLeftOpen,
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useSidebarStore } from "renderer/stores/sidebar-state";

export function PanelToggleButtons() {
	const isLeftPanelOpen = useSidebarStore((s) => s.isLeftPanelOpen);
	const isRightPanelOpen = useSidebarStore((s) => s.isRightPanelOpen);
	const toggleLeftPanel = useSidebarStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useSidebarStore((s) => s.toggleRightPanel);

	return (
		<div className="no-drag flex items-center">
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={toggleLeftPanel}
						className="group flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<span className="group-hover:hidden">
							<LuPanelLeft className="size-4" strokeWidth={1.5} />
						</span>
						<span className="hidden group-hover:block">
							{isLeftPanelOpen ? (
								<LuPanelLeftClose className="size-4" strokeWidth={1.5} />
							) : (
								<LuPanelLeftOpen className="size-4" strokeWidth={1.5} />
							)}
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyTooltipContent
						label={isLeftPanelOpen ? "Close left panel" : "Open left panel"}
						hotkeyId="TOGGLE_SIDEBAR"
					/>
				</TooltipContent>
			</Tooltip>

			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={toggleRightPanel}
						className="group flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<span className="group-hover:hidden">
							<LuPanelRight className="size-4" strokeWidth={1.5} />
						</span>
						<span className="hidden group-hover:block">
							{isRightPanelOpen ? (
								<LuPanelRightClose className="size-4" strokeWidth={1.5} />
							) : (
								<LuPanelRightOpen className="size-4" strokeWidth={1.5} />
							)}
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<HotkeyTooltipContent
						label={
							isRightPanelOpen ? "Close right panel" : "Open right panel"
						}
						hotkeyId="TOGGLE_SIDEBAR"
					/>
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
