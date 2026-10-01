import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { cn } from "@superset/ui/utils";

interface AutomationStatCardsProps {
	totalAutomations: number;
	succeeded7d: number;
	failed7d: number;
	missed7d: number;
	/** Run counts per 6-hour bucket over the last 7 days, oldest first. */
	buckets: number[];
	onShowFailed: () => void;
	onShowMissed: () => void;
	onShowHistory: () => void;
}

const CARD = "rounded-lg border border-border px-3.5 py-2.5 text-left";
const CLICKABLE =
	"cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const LABEL = "text-xs text-muted-foreground";
const VALUE = "mt-0.5 text-lg font-medium leading-tight tabular-nums";
const PCT = "ml-1.5 text-xs font-normal text-muted-foreground";

function RunSparkline({ buckets }: { buckets: number[] }) {
	const max = Math.max(...buckets, 1);
	return (
		<div className="mt-1.5 flex h-6 items-end gap-[3px]" aria-hidden="true">
			{buckets.map((count, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: buckets are fixed time slots
					key={index}
					className={cn(
						"flex-1 rounded-[1px]",
						count > 0 ? "bg-emerald-600" : "bg-muted-foreground/20",
					)}
					style={{
						height: count > 0 ? `${Math.max((count / max) * 100, 16)}%` : "2px",
					}}
				/>
			))}
		</div>
	);
}

export function AutomationStatCards({
	totalAutomations,
	succeeded7d,
	failed7d,
	missed7d,
	buckets,
	onShowFailed,
	onShowMissed,
	onShowHistory,
}: AutomationStatCardsProps) {
	const { t } = useLingui();
	const { formatNumber, formatPercent } = useFormat();
	const settled = succeeded7d + failed7d + missed7d;
	const pct = (n: number) =>
		settled > 0
			? formatPercent(n / settled, { maximumFractionDigits: 1 })
			: null;

	return (
		<div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
			<div className={CARD}>
				<p className={LABEL}>
					<Trans>Total automations</Trans>
				</p>
				<p className={VALUE}>{formatNumber(totalAutomations)}</p>
			</div>
			<div
				className={CARD}
				title={t({
					message: "Runs that started their workspace in the last 7 days",
				})}
			>
				<p className={LABEL}>
					<Trans>
						Successful runs{" "}
						<span className="text-muted-foreground/60">· 7d</span>
					</Trans>
				</p>
				<p className={VALUE}>
					{formatNumber(succeeded7d)}
					{pct(succeeded7d) && <span className={PCT}>{pct(succeeded7d)}</span>}
				</p>
			</div>
			<button
				type="button"
				onClick={onShowFailed}
				title={t({
					message: "Review these runs in All runs",
				})}
				className={cn(CARD, CLICKABLE)}
			>
				<p className={LABEL}>
					<Trans>
						Failed runs <span className="text-muted-foreground/60">· 7d</span>
					</Trans>
				</p>
				<p className={VALUE}>
					{formatNumber(failed7d)}
					{pct(failed7d) && <span className={PCT}>{pct(failed7d)}</span>}
				</p>
			</button>
			<button
				type="button"
				onClick={onShowMissed}
				title={t({
					message: "Scheduled runs that found no host online",
				})}
				className={cn(CARD, CLICKABLE)}
			>
				<p className={LABEL}>
					<Trans>
						Missed <span className="text-muted-foreground/60">· 7d</span>
					</Trans>
				</p>
				<p className={VALUE}>
					{formatNumber(missed7d)}
					{pct(missed7d) && <span className={PCT}>{pct(missed7d)}</span>}
				</p>
			</button>
			<button
				type="button"
				onClick={onShowHistory}
				title={t({
					message: "Review these runs in All runs",
				})}
				className={cn(CARD, CLICKABLE)}
			>
				<p className={LABEL}>
					<Trans>Run History</Trans>
					<span aria-hidden="true"> →</span>
				</p>
				<RunSparkline buckets={buckets} />
			</button>
		</div>
	);
}
