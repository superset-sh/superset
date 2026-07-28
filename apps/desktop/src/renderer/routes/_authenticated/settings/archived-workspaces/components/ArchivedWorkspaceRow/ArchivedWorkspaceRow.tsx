import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { LuGitBranch, LuLoaderCircle } from "react-icons/lu";
import { TeardownFailedPane } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog/components/TeardownFailedPane";
import type { HostWorkspaceItem } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import type { ArchivedRowStatus } from "../ArchivedWorkspacesSettings/ArchivedWorkspacesSettings";

interface ArchivedWorkspaceRowProps {
	workspace: HostWorkspaceItem;
	status: ArchivedRowStatus;
	hostReachable: boolean;
	onUnarchive: () => void;
	onDelete: () => void;
	onForceDelete: () => void;
	onDismissError: () => void;
}

function formatArchivedDate(date: Date | null): string {
	if (!date) return "";
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function ArchivedWorkspaceRow({
	workspace,
	status,
	hostReachable,
	onUnarchive,
	onDelete,
	onForceDelete,
	onDismissError,
}: ArchivedWorkspaceRowProps) {
	const displayName = workspace.name || workspace.branch;
	const projectName = workspace.projectName ?? null;
	const isDeleting = status.state === "deleting";
	const error = status.state === "error" ? status.error : null;

	return (
		<div
			className={cn(
				"flex flex-col gap-2 px-4 py-3",
				!hostReachable && "opacity-60",
			)}
		>
			<div className="flex items-center gap-4">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate text-sm font-medium">{displayName}</span>
						{projectName && (
							<span className="shrink-0 text-xs text-muted-foreground">
								{projectName}
							</span>
						)}
					</div>
					<div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
						<span className="flex min-w-0 items-center gap-1">
							<LuGitBranch className="size-3 shrink-0" />
							<span className="truncate font-mono text-[11px]">
								{workspace.branch}
							</span>
						</span>
						{workspace.archivedAt && (
							<span className="shrink-0">
								Archived {formatArchivedDate(workspace.archivedAt)}
							</span>
						)}
						{!hostReachable && (
							<span className="shrink-0">
								Host offline — actions unavailable
							</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{isDeleting ? (
						<LuLoaderCircle
							className="size-4 animate-spin text-muted-foreground"
							aria-label="Deleting workspace"
						/>
					) : (
						<>
							<Button
								size="sm"
								variant="secondary"
								className="h-7 px-3 text-xs"
								disabled={!hostReachable}
								onClick={onUnarchive}
							>
								Unarchive
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 px-3 text-xs text-destructive hover:text-destructive"
								disabled={!hostReachable}
								onClick={onDelete}
							>
								Delete
							</Button>
						</>
					)}
				</div>
			</div>

			{error && error.kind !== "teardown-failed" && (
				<div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
					<p className="select-text cursor-text min-w-0 flex-1 text-xs text-destructive">
						{"message" in error
							? error.message
							: `Delete failed (${error.kind})`}
					</p>
					<Button
						size="sm"
						variant="destructive"
						className="h-6 px-2 text-[11px]"
						onClick={onForceDelete}
					>
						Force delete
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-[11px]"
						onClick={onDismissError}
					>
						Dismiss
					</Button>
				</div>
			)}

			{error?.kind === "teardown-failed" && (
				// Mounted only while the error is set; closing clears the error,
				// which unmounts the pane — no separate open state to go stale.
				<TeardownFailedPane
					open
					onOpenChange={(open) => {
						if (!open) onDismissError();
					}}
					cause={error.cause}
					onForceDelete={onForceDelete}
				/>
			)}
		</div>
	);
}
