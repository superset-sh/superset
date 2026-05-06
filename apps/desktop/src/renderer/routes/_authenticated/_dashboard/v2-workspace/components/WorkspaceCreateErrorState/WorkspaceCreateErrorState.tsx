import { Button } from "@superset/ui/button";
import { AlertCircle, GitBranch } from "lucide-react";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import {
	useWorkspaceCreateFailuresStore,
	useWorkspaceCreates,
} from "renderer/stores/workspace-creates";

interface WorkspaceCreateErrorStateProps {
	workspaceId: string;
	name?: string;
	branch?: string;
	error: string;
}

export function WorkspaceCreateErrorState({
	workspaceId,
	name,
	branch,
	error,
}: WorkspaceCreateErrorStateProps) {
	const { submit } = useWorkspaceCreates();
	const navigateAway = useNavigateAwayFromWorkspace();

	const handleRetry = () => {
		const failure =
			useWorkspaceCreateFailuresStore.getState().failures[workspaceId];
		if (!failure) return;
		void submit({ hostId: failure.hostId, snapshot: failure.snapshot });
	};

	const handleDismiss = () => {
		useWorkspaceCreateFailuresStore.getState().clear(workspaceId);
		// `navigateAway` jumps to the next sidebar workspace when we're viewing
		// the one being dismissed — falls back to the top sidebar entry since
		// the failed id was never in the sidebar list, then to "/" if empty.
		navigateAway(workspaceId);
	};

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div
				role="alert"
				aria-live="assertive"
				className="flex w-full max-w-sm flex-col items-start gap-5"
			>
				<AlertCircle
					className="size-5 text-destructive"
					strokeWidth={1.5}
					aria-hidden="true"
				/>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						Couldn't create workspace
					</h1>
					<p className="truncate text-[13px] leading-relaxed text-muted-foreground">
						{name || "Untitled workspace"}
					</p>
				</div>

				{branch && (
					<div className="flex w-full items-center gap-2">
						<GitBranch
							className="size-3 shrink-0 text-muted-foreground/80"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{branch}
						</code>
					</div>
				)}

				<div className="w-full rounded-md border border-destructive/20 bg-destructive/[0.04] px-3 py-2.5">
					<p className="select-text font-mono text-[11px] leading-relaxed text-destructive/90 break-words whitespace-pre-wrap cursor-text">
						{error}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<Button size="sm" onClick={handleRetry}>
						Try again
					</Button>
					<Button size="sm" variant="ghost" onClick={handleDismiss}>
						Dismiss
					</Button>
				</div>
			</div>
		</div>
	);
}
