import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftOpen } from "lucide-react";

interface TopBarProps {
	isSidebarOpen: boolean;
	onOpenSidebar: () => void;
	workspaceName?: string;
	currentBranch?: string;
}

export function TopBar({
	isSidebarOpen,
	onOpenSidebar,
	workspaceName,
	currentBranch,
}: TopBarProps) {
	return (
		<div
			className="flex items-center justify-between text-neutral-300 select-none"
			style={{ height: "48px", WebkitAppRegion: "drag" } as React.CSSProperties}
		>
			{/* Left section - Sidebar toggle */}
			<div
				className="flex items-center"
				style={
					{
						paddingLeft: isSidebarOpen ? "1rem" : "88px",
						WebkitAppRegion: "no-drag",
					} as React.CSSProperties
				}
			>
				{!isSidebarOpen && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon-sm" onClick={onOpenSidebar}>
								<PanelLeftOpen size={16} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p>Expand sidebar</p>
						</TooltipContent>
					</Tooltip>
				)}
			</div>

			{/* Center section - Empty */}
			<div className="flex-1" />

			{/* Right section - Empty */}
			<div className="pr-4" />
		</div>
	);
}
