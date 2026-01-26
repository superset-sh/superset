import { useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ENABLE_CLOUD_WORKSPACES } from "shared/constants";
import { CloudWorkspaceButton } from "./CloudWorkspaceButton";
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
				{ENABLE_CLOUD_WORKSPACES && workspace && (
					<CloudWorkspaceButton
						workspaceId={workspace.id}
						workspaceName={workspace.name}
						branch={workspace.branch}
						cloudWorkspaceId={workspace.cloudWorkspaceId ?? null}
					/>
				)}
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
