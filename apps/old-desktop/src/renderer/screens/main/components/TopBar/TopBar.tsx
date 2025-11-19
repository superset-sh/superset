import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftOpen } from "lucide-react";

interface TopBarProps {
	isSidebarOpen: boolean;
	onOpenSidebar: () => void;
	workspaceName?: string;
	currentBranch?: string;
	mode?: "plan" | "edit";
	onModeChange?: (mode: "plan" | "edit") => void;
}

export function TopBar({
	isSidebarOpen,
	onOpenSidebar,
	workspaceName,
	currentBranch,
	mode = "edit",
	onModeChange,
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

			{/* Center section - Mode Toggle */}
			<div className="flex-1 flex items-center justify-center">
				{onModeChange && (
					<div
						className="inline-flex rounded-lg bg-neutral-800/50 p-1 gap-1"
						style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
					>
						<button
							type="button"
							onClick={() => onModeChange("plan")}
							className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
								mode === "plan"
									? "bg-neutral-700 text-white"
									: "text-neutral-400 hover:text-neutral-200"
							}`}
						>
							Plan
						</button>
						<button
							type="button"
							onClick={() => onModeChange("edit")}
							className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
								mode === "edit"
									? "bg-neutral-700 text-white"
									: "text-neutral-400 hover:text-neutral-200"
							}`}
						>
							Edit
						</button>
					</div>
				)}
			</div>

			{/* Right section - Empty */}
			<div className="pr-4" />
		</div>
	);
}
