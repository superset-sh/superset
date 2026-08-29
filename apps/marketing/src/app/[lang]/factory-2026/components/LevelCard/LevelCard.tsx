import { Trans, useLingui } from "@lingui/react/macro";
import {
	type FactoryLevel,
	formatTally,
	GATE_GLYPHS,
	GATE_STATUS_BY_ID,
	GATE_STATUS_LABELS,
	tallyGates,
} from "../../constants";
import { GateJumpLink } from "../GateJumpLink";

interface LevelCardProps {
	level: FactoryLevel;
}

const STATUS_TEXT_CLASSES = {
	open: "text-brand",
	partial: "text-brand",
	closed: "text-muted-foreground",
};

export function LevelCard({ level }: LevelCardProps) {
	const { t } = useLingui();
	const highlighted = level.id === "F4";
	const tracked = level.gates.some((gate) => gate.id);
	const tally = tracked ? tallyGates(level.id) : null;
	const tallyText = tally ? formatTally(tally) : "";

	return (
		<article
			id={level.id}
			className={`relative scroll-mt-24 border p-6 md:p-8 ${
				highlighted ? "border-brand/40 bg-brand/[0.04]" : "border-border"
			}`}
		>
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
				<span
					className={`text-sm font-mono ${highlighted ? "text-brand" : "text-muted-foreground"}`}
				>
					{level.id}
				</span>
				<h3 className="text-xl md:text-2xl font-medium tracking-tight text-foreground">
					{t(level.name)}
				</h3>
				<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
					{t(level.era)}
				</span>
				{level.badge && (
					<span
						className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider border rounded-[2px] px-2 py-0.5 ${
							highlighted
								? "border-brand/40 text-brand"
								: "border-border text-muted-foreground"
						}`}
					>
						{t(level.badge)}
					</span>
				)}
			</div>

			<p className="text-muted-foreground mt-3 leading-relaxed">
				{t(level.description)}
			</p>

			<div className="mt-5">
				<div className="flex items-baseline gap-3">
					<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
						<Trans id="marketing.factory.level.gatesLabel">Gates</Trans>
					</span>
					{tally && (
						<span className="text-xs font-mono text-brand">
							<Trans id="marketing.factory.level.gatesOpenTally">
								{tallyText} open
							</Trans>
						</span>
					)}
				</div>
				<ul className="mt-2 flex flex-col gap-1.5">
					{level.gates.map((gate) => {
						const status = gate.id ? GATE_STATUS_BY_ID[gate.id] : undefined;

						if (gate.id && status) {
							return (
								<li key={gate.text.id}>
									<GateJumpLink
										targetId={`gate-${gate.id}`}
										title={t({
											id: "marketing.factory.level.gateJumpTitle",
											message: "See this gate on the scorecard",
										})}
										className="group flex gap-2.5 text-sm text-muted-foreground leading-relaxed hover:text-foreground transition-colors"
									>
										<span
											className={`shrink-0 font-mono ${STATUS_TEXT_CLASSES[status]}`}
											aria-hidden="true"
										>
											{GATE_GLYPHS[status]}
										</span>
										<span>
											{t(gate.text)}{" "}
											<span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 group-hover:text-brand transition-colors">
												{t(GATE_STATUS_LABELS[status])} →
											</span>
										</span>
									</GateJumpLink>
								</li>
							);
						}

						return (
							<li
								key={gate.text.id}
								className="flex gap-2.5 text-sm text-muted-foreground leading-relaxed"
							>
								<span
									className={`shrink-0 font-mono ${highlighted ? "text-brand" : "text-foreground/40"}`}
									aria-hidden="true"
								>
									{level.id === "F5" ? GATE_GLYPHS.closed : "▸"}
								</span>
								{t(gate.text)}
							</li>
						);
					})}
				</ul>
			</div>
		</article>
	);
}
