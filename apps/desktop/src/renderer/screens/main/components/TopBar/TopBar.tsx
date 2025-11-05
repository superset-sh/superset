import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	Folder,
	GitBranch,
	MoreVertical,
	PanelLeftOpen,
	Plus,
	ListTodo,
	Code,
} from "lucide-react";

export type ViewMode = "workspace" | "plan";

interface TopBarProps {
	isSidebarOpen: boolean;
	onOpenSidebar: () => void;
	workspaceName?: string;
	currentBranch?: string;
	currentView?: ViewMode;
	onViewChange?: (view: ViewMode) => void;
}

export function TopBar({
	isSidebarOpen,
	onOpenSidebar,
	workspaceName,
	currentBranch,
	currentView = "workspace",
	onViewChange,
}: TopBarProps) {
	return (
		<div
			className="flex items-center justify-between text-neutral-300 select-none"
			style={{ height: "48px", WebkitAppRegion: "drag" } as React.CSSProperties}
		>
			{/* Left section - Sidebar toggle and View Switcher */}
			<div
				className="flex items-center gap-2"
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
				
				{/* View Switcher */}
				<div className="flex items-center gap-1 bg-neutral-900 rounded-lg border border-neutral-800 p-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={currentView === "workspace" ? "default" : "ghost"}
								size="icon-sm"
								onClick={() => onViewChange?.("workspace")}
								className={
									currentView === "workspace"
										? "bg-neutral-800"
										: "hover:bg-neutral-800"
								}
							>
								<Code size={16} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p>Workspace</p>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={currentView === "plan" ? "default" : "ghost"}
								size="icon-sm"
								onClick={() => onViewChange?.("plan")}
								className={
									currentView === "plan"
										? "bg-neutral-800"
										: "hover:bg-neutral-800"
								}
							>
								<ListTodo size={16} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p>Plan</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Center section - Workspace Info */}
			<div className="flex-1 flex items-center justify-center gap-3">
				{workspaceName ? (
					<>
						<div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
							<Folder size={14} className="opacity-70" />
							<span className="text-sm font-medium">{workspaceName}</span>
						</div>
						{currentBranch && (
							<div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
								<GitBranch size={14} className="opacity-70" />
								<span className="text-sm">{currentBranch}</span>
							</div>
						)}
					</>
				) : (
					<span className="text-sm text-neutral-500">No workspace open</span>
				)}
			</div>

			{/* Right section - Actions */}
			<div
				className="flex items-center gap-1 pr-4"
				style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
			>
				<Button variant="ghost" size="icon-sm" className="hover:bg-neutral-800">
					<Plus size={16} />
				</Button>
				<Button variant="ghost" size="icon-sm" className="hover:bg-neutral-800">
					<MoreVertical size={16} />
				</Button>
			</div>
		</div>
	);
}
