import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { LuGitBranch, LuLaptop, LuMonitor } from "react-icons/lu";
import { V2WorkspaceContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceContextMenu";
import { WorkspaceChecksDot } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceChecksDot";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { V2WorkspaceProjectIcon } from "../../../V2WorkspaceProjectIcon";

interface V2WorkspacesBoardCardProps {
	workspace: AccessibleV2Workspace;
}

export function V2WorkspacesBoardCard({
	workspace,
}: V2WorkspacesBoardCardProps) {
	// Archived tombstones have no worktree or terminals left — no navigation
	// and no context-menu actions apply.
	if (workspace.archivedAt != null) {
		return <BoardCardBody workspace={workspace} />;
	}
	return (
		<V2WorkspaceContextMenu workspace={workspace}>
			{(actions) => (
				<BoardCardBody workspace={workspace} onOpen={actions.open} />
			)}
		</V2WorkspaceContextMenu>
	);
}

function BoardCardBody({
	workspace,
	onOpen,
	...triggerProps
}: {
	workspace: AccessibleV2Workspace;
	onOpen?: () => void;
	// ContextMenuTrigger asChild merges its handlers/ref in here; they must
	// reach the real <button> or right-click never opens the menu.
} & React.ComponentPropsWithRef<"button">) {
	const { t } = useLingui();
	const isArchived = workspace.archivedAt != null;
	const HostIcon = workspace.hostType === "local-device" ? LuLaptop : LuMonitor;
	const timeLabel = getRelativeTime(
		workspace.archivedAt ?? workspace.createdAt.getTime(),
		{ format: "compact" },
	);

	return (
		<button
			{...triggerProps}
			type="button"
			onClick={onOpen}
			disabled={isArchived}
			className={cn(
				"w-full rounded-md border border-border/60 bg-card px-3 py-2.5 text-left transition-colors",
				isArchived
					? "cursor-default opacity-60"
					: "cursor-pointer hover:bg-accent/30",
			)}
		>
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<V2WorkspaceProjectIcon
						projectName={
							workspace.projectName ??
							t({
								message: "Session",
							})
						}
						iconUrl={workspace.projectIconUrl}
						size="sm"
					/>
					<span className="min-w-0 truncate">
						{workspace.projectName ?? <Trans>Session</Trans>}
					</span>
				</span>
				<span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
					<HostIcon className="size-3" />
					{workspace.hostName}
				</span>
			</div>

			<p className="mb-1.5 line-clamp-2 text-sm leading-snug">
				{workspace.name || workspace.branch}
			</p>

			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<LuGitBranch className="size-3 shrink-0" />
				<code className="min-w-0 flex-1 truncate font-mono text-[11px]">
					{workspace.branch}
				</code>
			</div>

			<div className="mt-1.5 flex items-center gap-1.5">
				{workspace.pr ? (
					<span className="flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
						<PRIcon state={workspace.pr.state} className="size-3" />#
						{workspace.pr.prNumber}
						<WorkspaceChecksDot
							status={workspace.pr.checksStatus}
							checks={workspace.pr.checks}
						/>
					</span>
				) : null}
				{isArchived ? (
					<Badge
						variant="outline"
						className="h-4 px-1.5 py-0 text-[10px] leading-none text-muted-foreground"
					>
						{workspace.archiveReason === "merged" ? (
							<Trans>Merged</Trans>
						) : (
							<Trans>Deleted</Trans>
						)}
					</Badge>
				) : null}
				<span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
					{timeLabel}
				</span>
			</div>
		</button>
	);
}
