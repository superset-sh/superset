import { Trans, useLingui } from "@lingui/react/macro";
import { FORECAST_STATUS_LABELS, type ForecastPeriod } from "../../constants";

interface ForecastEntryProps {
	entry: ForecastPeriod;
}

export function ForecastEntry({ entry }: ForecastEntryProps) {
	const { t } = useLingui();

	return (
		<article
			id={entry.id}
			className="relative scroll-mt-24 border-b border-border pb-16 last:border-b-0 last:pb-0"
		>
			{/* Sticky period label positioned to the left of the gridline */}
			<div
				className="hidden lg:flex absolute top-0 bottom-0 items-start"
				style={{ right: "calc(100% + 24px)" }}
			>
				<div className="sticky top-24 flex items-center gap-3 pt-1">
					<span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
						{t(entry.period)}
					</span>
					<div
						className={`w-0.5 h-5 ${entry.status === "forecast" ? "bg-border" : "bg-brand"}`}
					/>
				</div>
			</div>

			{/* Mobile period label */}
			<span className="lg:hidden block text-sm font-mono text-muted-foreground mb-4">
				{t(entry.period)}
			</span>

			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 mb-4">
				<h3 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
					{t(entry.title)}
				</h3>
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					{t(FORECAST_STATUS_LABELS[entry.status])}
				</span>
			</div>

			{entry.paragraphs.map((paragraph) => (
				<p
					key={paragraph.id}
					className="text-muted-foreground leading-relaxed mb-4 last:mb-0"
				>
					{t(paragraph)}
				</p>
			))}

			<div className="mt-6 border-l-2 border-brand/40 pl-4">
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					<Trans id="marketing.factory.forecast.becomesTrueLabel">
						What has to become true
					</Trans>
				</span>
				<p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">
					{t(entry.becomesTrue)}
				</p>
			</div>
		</article>
	);
}
