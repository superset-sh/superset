import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuArchive, LuArchiveRestore, LuTrash2 } from "react-icons/lu";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { DisabledReason } from "./components/DisabledReason";

interface ArchivedWorkspaceRowProps {
	workspace: AccessibleV2Workspace;
	/** A destroy is in flight for this row (the global delete dialog runs it). */
	isDeleting: boolean;
	onUnarchive: () => void;
	onDelete: () => void;
}

export function ArchivedWorkspaceRow({
	workspace,
	isDeleting,
	onUnarchive,
	onDelete,
}: ArchivedWorkspaceRowProps) {
	const { t } = useLingui();
	const offline = workspace.hostIsOffline;
	const disabled = offline || isDeleting;
	const name = workspace.name || workspace.branch;
	const offlineReason = t({
		message:
			"This workspace's host is offline. Actions resume when it reconnects.",
	});
	const archivedAgo =
		workspace.archivedAt != null
			? t({ message: `Archived ${formatRelativeTime(workspace.archivedAt)}` })
			: null;

	return (
		<div
			className={cn(
				"group flex items-center gap-3 px-6 py-3 text-sm",
				isDeleting && "opacity-60",
			)}
		>
			<LuArchive
				className="size-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>

			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium text-foreground" title={name}>
						{name}
					</span>
					{workspace.pr ? (
						<a
							href={workspace.pr.url}
							target="_blank"
							rel="noreferrer"
							aria-label={t({
								message: `Pull request #${workspace.pr.prNumber}, ${workspace.pr.state}`,
							})}
							className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<PRIcon state={workspace.pr.state} className="size-3.5" />
							<span className="tabular-nums">#{workspace.pr.prNumber}</span>
						</a>
					) : null}
					{offline ? (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<Badge variant="secondary" className="shrink-0">
									<Trans>Offline</Trans>
								</Badge>
							</TooltipTrigger>
							<TooltipContent side="top">{offlineReason}</TooltipContent>
						</Tooltip>
					) : null}
				</div>
				<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<span className="truncate font-mono">{workspace.branch}</span>
					<span aria-hidden="true">·</span>
					<span className="truncate">
						{workspace.projectName ?? t({ message: "Sessions" })}
					</span>
				</div>
			</div>

			{archivedAgo ? (
				<span
					className="shrink-0 text-xs tabular-nums text-muted-foreground"
					title={
						workspace.archivedAt != null
							? formatDateTime(workspace.archivedAt)
							: undefined
					}
				>
					{archivedAgo}
				</span>
			) : null}

			<div
				className={cn(
					"flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
					isDeleting && "opacity-100",
				)}
			>
				{isDeleting ? (
					<Spinner className="size-4 text-muted-foreground" />
				) : (
					<>
						<DisabledReason disabled={offline} reason={offlineReason}>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1.5 px-2 text-xs"
								disabled={disabled}
								onClick={onUnarchive}
							>
								<LuArchiveRestore className="size-3.5" />
								<Trans>Unarchive</Trans>
							</Button>
						</DisabledReason>
						<DisabledReason disabled={offline} reason={offlineReason}>
							<Button
								size="icon"
								variant="ghost"
								className="size-7 text-muted-foreground hover:text-destructive"
								disabled={disabled}
								onClick={onDelete}
								aria-label={t({ message: "Delete permanently" })}
							>
								<LuTrash2 className="size-3.5" />
							</Button>
						</DisabledReason>
					</>
				)}
			</div>
		</div>
	);
}
