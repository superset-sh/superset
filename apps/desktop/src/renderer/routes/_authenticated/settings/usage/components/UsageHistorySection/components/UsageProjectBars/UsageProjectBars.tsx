import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import { WorkspaceUsageRow } from "../../../WorkspaceUsageRow";

const MAX_ROWS = 7;

/**
 * Top workspaces/projects by cost — the attribution no menu-bar tracker
 * has. Transcript cwds are joined against the host's own workspace worktree
 * and project repo paths.
 */
export function UsageProjectBars({ history }: { history: UsageHistory }) {
	const rows = history.projects.slice(0, MAX_ROWS);
	if (rows.length === 0) return null;
	const maxUsd = rows[0]?.usd ?? 0;

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between border-b py-1 text-[11px] text-muted-foreground">
				<span className="font-medium">
					<Trans>Workspace</Trans>
				</span>
				<span className="flex items-baseline gap-2">
					<Link
						to="/settings/usage/workspaces"
						className="rounded px-1 text-[10px] transition-colors hover:bg-muted hover:text-foreground"
					>
						<Trans>All {history.projects.length} →</Trans>
					</Link>
					<span className="font-medium">
						<Trans>Cost</Trans>
					</span>
				</span>
			</div>
			{rows.map((row) => (
				<WorkspaceUsageRow
					key={row.project}
					row={row}
					maxValue={maxUsd}
					metric="usd"
					drillable={row.project in history.projectDetails}
				/>
			))}
		</div>
	);
}
