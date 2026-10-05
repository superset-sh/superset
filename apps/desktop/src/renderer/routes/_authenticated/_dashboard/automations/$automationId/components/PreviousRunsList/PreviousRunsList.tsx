import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceStrict } from "date-fns";
import { useNow } from "renderer/hooks/useNow";
import { describeRunError } from "../../../utils/runErrorHelp";
import { RUN_STATUS_META } from "../../../utils/runStatus";

type Run = RouterOutputs["automation"]["listOrgRuns"]["runs"][number];

interface PreviousRunsListProps {
	runs: Run[];
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
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

export function PreviousRunsList({
	runs,
	hasMore,
	isLoadingMore,
	onLoadMore,
}: PreviousRunsListProps) {
	const navigate = useNavigate();
	const now = useNow();

	if (runs.length === 0) {
		return (
			<p className="text-sm italic text-muted-foreground">
				<Trans>No runs yet</Trans>
			</p>
		);
	}

	const handleOpenRun = (run: Run) => {
		const workspaceId = run.v2WorkspaceId ?? run.cloudWorkspaceId;
		if (!workspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", workspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
			},
		});
	};

	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col gap-0.5 text-sm">
				{runs.map((run) => {
					const clickable = !!(run.v2WorkspaceId ?? run.cloudWorkspaceId);
					const meta = RUN_STATUS_META[run.status];
					return (
						<li key={run.id}>
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
									aria-label={i18n._(meta.label)}
									className={cn(
										"inline-block size-2 shrink-0 rounded-full",
										meta.dot,
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
							{run.error && (
								<p className="select-text cursor-text mx-2 mb-1 whitespace-pre-wrap rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
									{describeRunError(run)}
								</p>
							)}
						</li>
					);
				})}
			</ul>
			{hasMore && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="self-start text-muted-foreground"
					disabled={isLoadingMore}
					onClick={onLoadMore}
				>
					<Trans>Load more</Trans>
				</Button>
			)}
		</div>
	);
}
