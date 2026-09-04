import { Trans, useLingui } from "@lingui/react/macro";
import {
	FACTORY_LEVELS,
	formatTally,
	GATE_SCORECARD,
	GATE_STATUS_LABELS,
	tallyGates,
} from "../../constants";
import { GateJumpLink } from "../GateJumpLink";

const SEGMENT_CLASSES = {
	open: "bg-brand",
	partial:
		"bg-[repeating-linear-gradient(135deg,var(--brand)_0,var(--brand)_3px,transparent_3px,transparent_6px)]",
	closed: "bg-foreground/10",
};

export function HeroStats() {
	const { t } = useLingui();
	const f3 = tallyGates("F3");
	const f4 = tallyGates("F4");
	const currentLevel = FACTORY_LEVELS.find((level) => level.id === "F3");

	return (
		<div className="mt-8 grid grid-cols-1 sm:grid-cols-3 border border-border divide-y sm:divide-y-0 sm:divide-x divide-border">
			<div className="px-4 py-3 md:px-5">
				<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
					<Trans>Current level</Trans>
				</span>
				<p className="text-lg font-mono text-foreground mt-1">
					F3{" "}
					<span className="text-muted-foreground text-sm">
						· {currentLevel ? t(currentLevel.name) : null}
					</span>
				</p>
			</div>
			<div className="px-4 py-3 md:px-5">
				<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
					<Trans>Gates open</Trans>
				</span>
				<p className="text-lg font-mono text-foreground mt-1">
					{formatTally(f3)}{" "}
					<span className="text-muted-foreground text-sm">F3</span>
					<span className="text-muted-foreground text-sm"> · </span>
					{formatTally(f4)}{" "}
					<span className="text-muted-foreground text-sm">F4</span>
				</p>
				<div className="flex gap-0.5 mt-2">
					{GATE_SCORECARD.map((score) => {
						const level = score.level;
						const gate = t(score.gate);
						const statusLabel = t(GATE_STATUS_LABELS[score.status]);
						return (
							<GateJumpLink
								key={score.gateId}
								targetId={`gate-${score.gateId}`}
								title={t({
									message: `${level} · ${gate} · ${statusLabel}`,
								})}
								className={`h-1.5 flex-1 hover:outline hover:outline-1 hover:outline-brand ${SEGMENT_CLASSES[score.status]}`}
							>
								<span className="sr-only">
									<Trans>
										{level} {gate}: {statusLabel}
									</Trans>
								</span>
							</GateJumpLink>
						);
					})}
				</div>
			</div>
			<div className="px-4 py-3 md:px-5">
				<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
					<Trans>F4 gate crossed</Trans>
				</span>
				<p className="text-lg font-mono text-foreground mt-1">
					2027{" "}
					<span className="text-muted-foreground text-sm">
						· <Trans>forecast</Trans>
					</span>
				</p>
			</div>
		</div>
	);
}
