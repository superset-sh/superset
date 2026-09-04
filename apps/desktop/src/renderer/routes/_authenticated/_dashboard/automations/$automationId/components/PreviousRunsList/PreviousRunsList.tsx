import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { SelectAutomationRun } from "@superset/db/schema";
import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { useNow } from "renderer/hooks/useNow";
import {
	HOST_OFFLINE_HELP,
	isHostOfflineError,
} from "../../../utils/hostOfflineError";
import {
	isStaleAgentError,
	STALE_AGENT_HELP,
} from "../../../utils/staleAgentError";

function describeRunError(error: string): string {
	if (isHostOfflineError(error))
		return `${error}. ${i18n._(HOST_OFFLINE_HELP)}`;
	// Lead with the plain-language fix; keep the raw host error for reports.
	if (isStaleAgentError(error))
		return `${i18n._(STALE_AGENT_HELP)}\n\n(${error})`;
	return error;
}

const STATUS_DOT: Record<SelectAutomationRun["status"], string> = {
	dispatched: "bg-emerald-500",
	dispatching: "bg-amber-500",
	skipped_offline: "bg-red-500",
	dispatch_failed: "bg-red-500",
	debounced: "bg-slate-400",
	rejected: "bg-amber-500",
};

interface PreviousRunsListProps {
	runs: SelectAutomationRun[];
}

function formatAgo(date: Date, now: Date): string {
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
	if (seconds < 60)
		return i18n._(
			msg({
				message: "less than a minute ago",
			}),
		);
	const distance = formatDistanceStrict(date, now);
	return i18n._(
		msg({
			message: `${distance} ago`,
		}),
	);
}

export function PreviousRunsList({ runs }: PreviousRunsListProps) {
	const navigate = useNavigate();
	const now = useNow();

	if (runs.length === 0) {
		return (
			<p className="text-sm italic text-muted-foreground">
				<Trans>No runs yet</Trans>
			</p>
		);
	}

	const handleOpenRun = (run: SelectAutomationRun) => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
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
						<span className="truncate">
							{run.title || <Trans>Automation</Trans>}
						</span>
						<span className="ml-auto shrink-0 truncate text-muted-foreground">
							{run.scheduledFor
								? formatAgo(new Date(run.scheduledFor), now)
								: "—"}
						</span>
					</button>
				);
				return (
					<li key={run.id}>
						{row}
						{run.error && (
							<p className="select-text cursor-text mx-2 mb-1 whitespace-pre-wrap rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
								{describeRunError(run.error)}
							</p>
						)}
					</li>
				);
			})}
		</ul>
	);
}
