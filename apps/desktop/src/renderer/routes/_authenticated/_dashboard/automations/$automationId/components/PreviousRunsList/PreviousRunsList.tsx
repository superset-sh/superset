import type { SelectAutomationRun } from "@superset/db/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { formatDistanceStrict } from "date-fns";
import { useNow } from "renderer/hooks/useNow";
import {
	getAutomationRunError,
	getAutomationRunStatusView,
} from "../../utils/automationRunDisplay";

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
	selectedRunId?: string | null;
	onSelectRun: (runId: string) => void;
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	return `${formatDistanceStrict(date, now)} ago`;
}

export function PreviousRunsList({
	runs,
	selectedRunId,
	onSelectRun,
}: PreviousRunsListProps) {
	const now = useNow();

	if (runs.length === 0) {
		return <p className="text-sm italic text-muted-foreground">No runs yet</p>;
	}

	return (
		<ul className="flex flex-col gap-0.5 text-sm">
			{runs.map((run) => {
				const statusView = getAutomationRunStatusView(run.status);
				const runError = getAutomationRunError(run);
				const isSelected = run.id === selectedRunId;
				const time = run.completedAt ?? run.startedAt ?? run.scheduledFor;
				const row = (
					<button
						type="button"
						aria-pressed={isSelected}
						onClick={() => onSelectRun(run.id)}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
							"cursor-pointer hover:bg-accent/40",
							isSelected && "bg-accent text-accent-foreground",
						)}
					>
						<span
							role="img"
							aria-label={statusView.label}
							className={cn(
								"inline-block size-2 shrink-0 rounded-full",
								statusView.dotClassName,
							)}
						/>
						<span className="min-w-0 flex-1 truncate">
							{run.resultSummary || run.title || "Automation"}
						</span>
						<span className="ml-auto shrink-0 truncate text-muted-foreground">
							{time ? formatAgo(new Date(time), now) : "—"}
						</span>
					</button>
				);
				return (
					<li key={run.id}>
						{runError ? (
							<Tooltip>
								<TooltipTrigger asChild>{row}</TooltipTrigger>
								<TooltipContent
									side="left"
									className="max-w-xs whitespace-pre-wrap"
								>
									{runError}
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
