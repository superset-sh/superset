import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderX, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { DashboardSidebarDeleteDialog } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarDeleteDialog";

interface WorkspaceMissingWorktreeStateProps {
	workspaceId: string;
	workspaceName: string;
	branch: string;
	worktreePath?: string;
	onRefresh: () => void;
	isRefreshing?: boolean;
}

export function WorkspaceMissingWorktreeState({
	workspaceId,
	workspaceName,
	branch,
	worktreePath,
	onRefresh,
	isRefreshing = false,
}: WorkspaceMissingWorktreeStateProps) {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const displayName = workspaceName || branch;

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-start gap-5">
				<div className="grid size-10 place-items-center rounded-lg border border-destructive/20 bg-destructive/10">
					<FolderX
						className="size-[18px] text-destructive"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="select-text cursor-text text-[15px] font-medium tracking-tight text-foreground">
						Worktree missing
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						This workspace record still exists, but its worktree folder is no
						longer on this host. Terminals and file actions are unavailable.
					</p>
				</div>

				{worktreePath ? (
					<div className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
						<span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
							Path
						</span>
						<div className="min-w-0 flex-1 overflow-x-auto">
							<code
								className="inline-block min-w-max select-text cursor-text whitespace-nowrap font-mono text-[11px] text-muted-foreground"
								title={worktreePath}
							>
								{worktreePath}
							</code>
						</div>
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="destructive"
						className="h-7 gap-1.5 px-2.5 text-[13px]"
						onClick={() => setDeleteDialogOpen(true)}
					>
						<Trash2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
						Delete workspace
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium"
						onClick={onRefresh}
						disabled={isRefreshing}
					>
						<RefreshCw
							className="size-3.5"
							strokeWidth={2}
							aria-hidden="true"
						/>
						Refresh
					</Button>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium"
					>
						<Link to="/v2-workspaces">
							Browse workspaces
							<ArrowRight
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
						</Link>
					</Button>
				</div>

				<DashboardSidebarDeleteDialog
					workspaceId={workspaceId}
					workspaceName={displayName}
					open={deleteDialogOpen}
					onOpenChange={setDeleteDialogOpen}
				/>
			</div>
		</div>
	);
}
