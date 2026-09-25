import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

interface AutomationStatCardsProps {
	active: number;
	created7d: number;
	failed7d: number;
	/** True while the table is narrowed to failing automations. */
	failedFilter: boolean;
	/** False when no automation is currently failing (card renders inert). */
	canFilterFailed: boolean;
	onToggleFailedFilter: () => void;
}

const CARD = "rounded-lg border border-border px-3.5 py-2.5 text-left";
const LABEL = "text-xs text-muted-foreground";
const VALUE = "mt-0.5 text-lg font-medium leading-tight tabular-nums";
const PCT = "ml-1.5 text-xs font-normal text-muted-foreground";

export function AutomationStatCards({
	active,
	created7d,
	failed7d,
	failedFilter,
	canFilterFailed,
	onToggleFailedFilter,
}: AutomationStatCardsProps) {
	const { t } = useLingui();
	const total = created7d + failed7d;
	const pct = (n: number) =>
		total > 0 ? `${((n / total) * 100).toFixed(1)}%` : null;

	return (
		<div className="grid grid-cols-3 gap-2">
			<div className={CARD}>
				<p className={LABEL}>
					<Trans>Active</Trans>
				</p>
				<p className={VALUE}>{active}</p>
			</div>
			<div
				className={CARD}
				title={t({
					message: "Workspaces created by runs in the last 7 days",
				})}
			>
				<p className={LABEL}>
					<Trans>
						Created <span className="text-muted-foreground/60">· 7d</span>
					</Trans>
				</p>
				<p className={VALUE}>
					{created7d}
					{pct(created7d) && <span className={PCT}>{pct(created7d)}</span>}
				</p>
			</div>
			<button
				type="button"
				disabled={!canFilterFailed && !failedFilter}
				onClick={onToggleFailedFilter}
				title={
					failedFilter
						? t({
								message: "Show all automations again",
							})
						: canFilterFailed
							? t({
									message: "Show only automations whose last run failed",
								})
							: t({
									message:
										"Runs failed earlier this week, but nothing is failing right now",
								})
				}
				className={cn(
					CARD,
					"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					(canFilterFailed || failedFilter) &&
						"cursor-pointer hover:bg-accent/40",
					failedFilter && "border-red-500/40 bg-red-500/5",
				)}
			>
				<p className={LABEL}>
					<Trans>
						Failed <span className="text-muted-foreground/60">· 7d</span>
					</Trans>
					{failedFilter && (
						<span className="ml-1.5 text-red-600 dark:text-red-400">
							<Trans>filtering</Trans>
						</span>
					)}
				</p>
				<p className={VALUE}>
					{failed7d}
					{pct(failed7d) && <span className={PCT}>{pct(failed7d)}</span>}
				</p>
			</button>
		</div>
	);
}
