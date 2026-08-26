import { type ForecastPeriod, PERIOD_IDS } from "../../constants";

interface ForecastEntryProps {
	entry: ForecastPeriod;
}

const STATUS_LABELS: Record<ForecastPeriod["status"], string> = {
	happened: "Happened",
	underway: "Underway",
	forecast: "Forecast",
};

export function ForecastEntry({ entry }: ForecastEntryProps) {
	return (
		<article
			id={PERIOD_IDS[entry.period]}
			className="relative scroll-mt-24 border-b border-border pb-16 last:border-b-0 last:pb-0"
		>
			{/* Sticky period label positioned to the left of the gridline */}
			<div
				className="hidden lg:flex absolute top-0 bottom-0 items-start"
				style={{ right: "calc(100% + 24px)" }}
			>
				<div className="sticky top-24 flex items-center gap-3 pt-1">
					<span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
						{entry.period}
					</span>
					<div
						className={`w-0.5 h-5 ${entry.status === "forecast" ? "bg-border" : "bg-brand"}`}
					/>
				</div>
			</div>

			{/* Mobile period label */}
			<span className="lg:hidden block text-sm font-mono text-muted-foreground mb-4">
				{entry.period}
			</span>

			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 mb-4">
				<h3 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
					{entry.title}
				</h3>
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					{STATUS_LABELS[entry.status]}
				</span>
			</div>

			{entry.paragraphs.map((paragraph) => (
				<p
					key={paragraph}
					className="text-muted-foreground leading-relaxed mb-4 last:mb-0"
				>
					{paragraph}
				</p>
			))}

			<div className="mt-6 border-l-2 border-brand/40 pl-4">
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					What has to become true
				</span>
				<p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">
					{entry.becomesTrue}
				</p>
			</div>
		</article>
	);
}
