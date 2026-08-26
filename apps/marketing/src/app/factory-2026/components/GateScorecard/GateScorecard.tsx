import type { GateScore, GateStatus } from "../../constants";

interface GateScorecardProps {
	scores: GateScore[];
}

const STATUS_META: Record<
	GateStatus,
	{ glyph: string; label: string; className: string }
> = {
	open: { glyph: "●", label: "Open", className: "text-brand" },
	partial: { glyph: "◐", label: "Partial", className: "text-foreground/70" },
	closed: { glyph: "○", label: "Closed", className: "text-muted-foreground" },
};

export function GateScorecard({ scores }: GateScorecardProps) {
	return (
		<div className="border border-border">
			{scores.map((score) => {
				const status = STATUS_META[score.status];
				return (
					<div
						key={score.gateId}
						id={`gate-${score.gateId}`}
						className="grid scroll-mt-24 grid-cols-[auto_1fr] md:grid-cols-[3rem_1fr_7rem] gap-x-4 gap-y-1 items-baseline border-b border-border last:border-b-0 px-4 py-3 md:px-6 md:py-4 transition-colors duration-700"
					>
						<span className="text-sm font-mono text-muted-foreground">
							{score.level}
						</span>
						<div>
							<p className="text-sm text-foreground leading-relaxed">
								{score.gate}
							</p>
							<p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
								{score.note}
							</p>
						</div>
						<span
							className={`col-start-2 md:col-start-3 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider ${status.className}`}
						>
							<span aria-hidden="true">{status.glyph}</span>
							{status.label}
						</span>
					</div>
				);
			})}
		</div>
	);
}
