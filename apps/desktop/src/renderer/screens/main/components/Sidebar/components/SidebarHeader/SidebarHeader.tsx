import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Code, KanbanSquare, RefreshCw, Settings } from "lucide-react";
import type { ViewMode } from "../ModeSwitcher";

interface SidebarHeaderProps {
	onScanWorktrees: () => void;
	isScanningWorktrees: boolean;
	hasWorkspace: boolean;
	viewMode: ViewMode;
	onViewModeChange: (mode: ViewMode) => void;
}

export function SidebarHeader({
	onScanWorktrees,
	isScanningWorktrees,
	hasWorkspace,
	viewMode,
	onViewModeChange,
}: SidebarHeaderProps) {
	const handleOpenSettings = async () => {
		const result = await window.ipcRenderer.invoke("open-app-settings");
		if (!result.success) {
			alert(`Failed to open settings: ${result.error}`);
		}
	};

	return (
		<div
			className="flex items-center justify-between"
			style={
				{
					height: "48px",
					paddingLeft: "88px",
					paddingRight: "12px",
					WebkitAppRegion: "drag",
				} as React.CSSProperties
			}
		>
			{/* Mode Switcher */}
			<div
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				className="flex items-center gap-0.5 bg-neutral-800 rounded-md p-0.5"
			>
				<button
					type="button"
					onClick={() => onViewModeChange("code")}
					className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
						viewMode === "code"
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:text-neutral-300"
					}`}
				>
					<Code size={12} />
					<span>Code</span>
				</button>
				<button
					type="button"
					onClick={() => onViewModeChange("plan")}
					className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
						viewMode === "plan"
							? "bg-neutral-700 text-white"
							: "text-neutral-400 hover:text-neutral-300"
					}`}
				>
					<KanbanSquare size={12} />
					<span>Plan</span>
				</button>
			</div>

			{/* Action Buttons */}
			<div
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				className="flex items-center gap-0.5"
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onScanWorktrees}
							disabled={isScanningWorktrees || !hasWorkspace}
							className="h-6 w-6"
						>
							<RefreshCw
								size={12}
								className={isScanningWorktrees ? "animate-spin" : ""}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Scan worktrees</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleOpenSettings}
							className="h-6 w-6"
						>
							<Settings size={12} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p>Open app settings</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
