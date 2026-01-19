import { Button } from "@superset/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@superset/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { HiOutlineDevicePhoneMobile } from "react-icons/hi2";
import { useMobilePairingModal } from "renderer/components/MobilePairingModal";
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
	const openMobilePairing = useMobilePairingModal((s) => s.openModal);
	// Default to Mac layout while loading to avoid overlap with traffic lights
	const isMac = platform === undefined || platform === "darwin";

	return (
		<div className="drag gap-2 h-12 w-full flex items-center justify-between bg-background border-b border-border">
			<div
				className="flex items-center gap-2 h-full"
				style={{
					paddingLeft: isMac ? "88px" : "16px",
				}}
			/>

			<div className="flex-1" />

			<div className="flex items-center gap-3 h-full pr-4 shrink-0">
				{workspace?.worktreePath && (
					<OpenInMenuButton
						worktreePath={workspace.worktreePath}
						branch={workspace.worktree?.branch}
					/>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="no-drag h-8 w-8"
							onClick={() =>
								openMobilePairing({
									workspaceId: workspace?.id,
									workspaceName: workspace?.name,
									projectPath: workspace?.worktreePath,
								})
							}
						>
							<HiOutlineDevicePhoneMobile className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Connect Mobile</TooltipContent>
				</Tooltip>
				<OrganizationDropdown />
				{!isMac && <WindowControls />}
			</div>
		</div>
	);
}
