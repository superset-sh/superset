import { Trans, useLingui } from "@lingui/react/macro";
import {
	formatTally,
	GATE_SCORECARD,
	GATE_STATUS_LABELS,
	tallyGates,
} from "../../../../constants";
import { GateJumpLink } from "../../../GateJumpLink";

const CELL_CLASSES = {
	open: "bg-brand",
	partial:
		"bg-[linear-gradient(90deg,var(--brand)_50%,transparent_50%)] border border-brand/50",
	closed: "bg-foreground/10",
};

interface GateMeterProps {
	level: string;
}

export function GateMeter({ level }: GateMeterProps) {
	const { t } = useLingui();
	const scores = GATE_SCORECARD.filter((score) => score.level === level);
	const tally = tallyGates(level);
	return (
		<div className="flex items-center gap-2">
			<span className="w-5 text-[10px] font-mono text-muted-foreground">
				{level}
			</span>
			<div className="flex gap-0.5">
				{scores.map((score) => {
					const gate = t(score.gate);
					const statusLabel = t(GATE_STATUS_LABELS[score.status]);
					return (
						<GateJumpLink
							key={score.gateId}
							targetId={`gate-${score.gateId}`}
							title={t({
								id: "marketing.factory.gateMeter.jumpTitle",
								message: `${gate} · ${statusLabel}`,
							})}
							className={`h-2.5 w-2.5 hover:outline hover:outline-1 hover:outline-brand ${CELL_CLASSES[score.status]}`}
						>
							<span className="sr-only">
								<Trans id="marketing.factory.gateMeter.jumpLabel">
									{gate}: {statusLabel}
								</Trans>
							</span>
						</GateJumpLink>
					);
				})}
			</div>
			<span className="text-[10px] font-mono text-brand tabular-nums">
				{formatTally(tally)}
			</span>
		</div>
	);
}
