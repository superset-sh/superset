import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { LuPanelLeft, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { OpenInMenuButton } from "./OpenInMenuButton";
import { OrganizationDropdown } from "./OrganizationDropdown";
import { WindowControls } from "./WindowControls";

export function TopBar() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const { isCollapsed, toggleCollapsed } = useWorkspaceSidebarStore();
	const collapsed = isCollapsed();
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

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
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border">
			<div
				className="flex items-center gap-2 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			>
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
						<HotkeyTooltipContent
							label="Toggle sidebar"
							hotkeyId="TOGGLE_WORKSPACE_SIDEBAR"
						/>
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="flex-1" />

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{workspace?.worktreePath && (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						branch={workspace.worktree?.branch}
					/>
				)}
				<OrganizationDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
