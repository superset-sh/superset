import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { PanelLeftClose, RefreshCw, Settings } from "lucide-react";

interface SidebarHeaderProps {
	onCollapse: () => void;
	onScanWorktrees: () => void;
	isScanningWorktrees: boolean;
	hasWorkspace: boolean;
}

export function SidebarHeader({
	onCollapse,
	onScanWorktrees,
	isScanningWorktrees,
	hasWorkspace,
}: SidebarHeaderProps) {
	const handleOpenSettings = async () => {
		const result = await window.ipcRenderer.invoke("open-app-settings");
		if (!result.success) {
			alert(`Failed to open settings: ${result.error}`);
		}
	};

	return (
		<div
			className="flex items-center justify-center border-b border-neutral-800/50"
			style={
				{
					height: "48px",
					WebkitAppRegion: "drag",
				} as React.CSSProperties
			}
		>
			<div
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				className="flex items-center gap-0.5"
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onCollapse}
							className="h-7 w-7 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
						>
							<PanelLeftClose size={14} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p className="text-xs">Collapse sidebar</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onScanWorktrees}
							disabled={isScanningWorktrees || !hasWorkspace}
							className="h-7 w-7 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
						>
							<RefreshCw
								size={14}
								className={isScanningWorktrees ? "animate-spin" : ""}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p className="text-xs">Scan worktrees</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleOpenSettings}
							className="h-7 w-7 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
						>
							<Settings size={14} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<p className="text-xs">Open app settings</p>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
