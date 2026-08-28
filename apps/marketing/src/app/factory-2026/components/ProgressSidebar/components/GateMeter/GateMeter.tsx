import { formatTally, GATE_SCORECARD, tallyGates } from "../../../../constants";
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
	const scores = GATE_SCORECARD.filter((score) => score.level === level);
	const tally = tallyGates(level);
	return (
		<div className="flex items-center gap-2">
			<span className="w-5 text-[10px] font-mono text-muted-foreground">
				{level}
			</span>
			<div className="flex gap-0.5">
				{scores.map((score) => (
					<GateJumpLink
						key={score.gateId}
						targetId={`gate-${score.gateId}`}
						title={`${score.gate} · ${score.status}`}
						className={`h-2.5 w-2.5 hover:outline hover:outline-1 hover:outline-brand ${CELL_CLASSES[score.status]}`}
					>
						<span className="sr-only">
							{score.gate}: {score.status}
						</span>
					</GateJumpLink>
				))}
			</div>
			<span className="text-[10px] font-mono text-brand tabular-nums">
				{formatTally(tally)}
			</span>
		</div>
	);
}
