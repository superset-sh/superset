import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { LuCloud } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";
	const isCloudWorkspace = workspace?.type === "cloud";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border">
			<div
				className="flex items-center gap-2 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			>
				{isCloudWorkspace && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<div className="no-drag flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
								<LuCloud className="size-3.5" />
								<span>Cloud</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p className="text-xs">Cloud workspace - hosted remotely</p>
						</TooltipContent>
					</Tooltip>
				)}
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
