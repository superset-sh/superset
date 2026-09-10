import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { CgLaptop } from "react-icons/cg";
import { LuGitBranch, LuMonitor } from "react-icons/lu";
import { V2WorkspaceContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceContextMenu";
import { WorkspaceChecksDot } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceChecksDot";
import { WorkspaceStateGlyph } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceStateGlyph";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { workspaceActivityAt } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { V2WorkspaceProjectIcon } from "../../../V2WorkspaceProjectIcon";

interface V2WorkspacesBoardCardProps {
	workspace: AccessibleV2Workspace;
}

// Memoized for the same reason as V2WorkspaceRow: board-wide filter changes
// must not re-render every card.
export const V2WorkspacesBoardCard = memo(function V2WorkspacesBoardCard({
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
});

/** 181909 → "181.9k" — keeps outlier churn from blowing out the pill. */
function formatCount(count: number): string {
	if (count < 10_000) return String(count);
	return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

const PILL_CLASS =
	"inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1.5 text-[11px] tabular-nums leading-none text-muted-foreground";

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
	const isDone = isArchived || workspace.pr?.state === "merged";
	const isMainWorkspace = workspace.type === "main";
	// Same rule as the list row: the branch line only earns its slot when it
	// says something the title doesn't.
	const showBranch =
		workspace.type !== "session" &&
		workspace.branch.toLowerCase() !== workspace.name.toLowerCase();
	const hasDiff =
		workspace.diffStats != null &&
		(workspace.diffStats.additions > 0 || workspace.diffStats.deletions > 0);
	const timeLabel = getRelativeTime(
		workspace.archivedAt ?? workspaceActivityAt(workspace),
		{ format: "compact" },
	);

	return (
		<button
			{...triggerProps}
			type="button"
			onClick={onOpen}
			disabled={isArchived}
			className={cn(
				"w-full rounded-lg border border-border/50 bg-card px-3.5 py-3 text-left shadow-xs transition-colors",
				isArchived
					? "cursor-default opacity-60"
					: "cursor-pointer hover:border-border hover:bg-accent/30",
			)}
		>
			<div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
				<V2WorkspaceProjectIcon
					projectName={
						workspace.projectName ??
						t({
							message: "Session",
						})
					}
					iconUrl={workspace.projectIconUrl}
					size="sm"
					className="size-4 rounded-sm text-[9px]"
				/>
				<span className="min-w-0 truncate">
					{workspace.projectName ?? <Trans>Session</Trans>}
				</span>
				{isMainWorkspace ? (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<span className="flex shrink-0 items-center">
								<CgLaptop
									className="size-3.5"
									aria-label={t({
										message: "Main workspace",
									})}
								/>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top">
							<Trans>Main workspace</Trans>
						</TooltipContent>
					</Tooltip>
				) : null}
				{workspace.hostType !== "local-device" ? (
					<span className="flex min-w-0 shrink items-center gap-1">
						<LuMonitor className="size-3 shrink-0" />
						<span className="truncate">{workspace.hostName}</span>
					</span>
				) : null}
				<span className="ml-auto whitespace-nowrap tabular-nums">
					{timeLabel}
				</span>
			</div>

			<p
				className={cn(
					"line-clamp-2 min-w-0 text-[13px] font-medium leading-[18px]",
					// Done states recede so live work owns the contrast.
					isDone ? "text-muted-foreground" : "text-foreground",
				)}
			>
				{workspace.name || workspace.branch}
			</p>

			{showBranch ? (
				<div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
					<LuGitBranch className="size-3 shrink-0" />
					<code className="min-w-0 truncate font-mono">{workspace.branch}</code>
				</div>
			) : null}

			<div className="mt-2 flex items-center gap-1.5">
				{workspace.pr ? (
					<span className={PILL_CLASS}>
						<PRIcon state={workspace.pr.state} className="size-3" />#
						{workspace.pr.prNumber}
						<WorkspaceChecksDot
							status={workspace.pr.checksStatus}
							checks={workspace.pr.checks}
						/>
					</span>
				) : null}
				{hasDiff && workspace.diffStats ? (
					<span
						className={cn(PILL_CLASS, "font-mono")}
						title={t({
							message: plural(workspace.diffStats.fileCount, {
								one: "# changed file",
								other: "# changed files",
							}),
						})}
					>
						<span className="text-emerald-600/80 dark:text-emerald-400/70">
							+{formatCount(workspace.diffStats.additions)}
						</span>
						<span className="text-red-600/80 dark:text-red-400/70">
							−{formatCount(workspace.diffStats.deletions)}
						</span>
					</span>
				) : null}
				{isArchived ? (
					<span className={PILL_CLASS}>
						{workspace.archiveReason === "merged" ? (
							<Trans>Merged</Trans>
						) : (
							<Trans>Deleted</Trans>
						)}
					</span>
				) : null}
				<span className="ml-auto flex shrink-0 items-center">
					<WorkspaceStateGlyph workspace={workspace} />
				</span>
			</div>
		</button>
	);
}
