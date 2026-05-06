import type { SelectAutomationRun } from "@superset/db/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { useNow } from "renderer/hooks/useNow";

const STATUS_DOT: Record<SelectAutomationRun["status"], string> = {
	dispatched: "bg-emerald-500",
	dispatching: "bg-amber-500",
	skipped_offline: "bg-red-500",
	dispatch_failed: "bg-red-500",
};

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	return `${formatDistanceStrict(date, now)} ago`;
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	const navigate = useNavigate();
	const now = useNow();

	if (runs.length === 0) {
		return <p className="text-sm italic text-muted-foreground">No runs yet</p>;
	}

	const handleOpenRun = (run: SelectAutomationRun) => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
				chatSessionId: run.chatSessionId ?? undefined,
			},
		});
	};

	return (
		<ul className="flex flex-col gap-0.5 text-sm">
			{runs.map((run) => {
				const clickable = !!run.v2WorkspaceId;
				const row = (
					<button
						type="button"
						disabled={!clickable}
						onClick={() => handleOpenRun(run)}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
							clickable
								? "cursor-pointer hover:bg-accent/40"
								: "cursor-default opacity-70",
						)}
					>
						<span
							role="img"
							aria-label={run.status}
							className={cn(
								"inline-block size-2 shrink-0 rounded-full",
								STATUS_DOT[run.status],
							)}
						/>
						<span className="truncate">{run.title || "Automation"}</span>
						<span className="ml-auto shrink-0 truncate text-muted-foreground">
							{run.scheduledFor
								? formatAgo(new Date(run.scheduledFor), now)
								: "—"}
						</span>
					</button>
				);
				return (
					<li key={run.id}>
						{run.error ? (
							<Tooltip>
								<TooltipTrigger asChild>{row}</TooltipTrigger>
								<TooltipContent
									side="left"
									className="max-w-xs whitespace-pre-wrap"
								>
									{run.error}
								</TooltipContent>
							</Tooltip>
						) : (
							row
						)}
					</li>
				);
			})}
		</ul>
	);
}
