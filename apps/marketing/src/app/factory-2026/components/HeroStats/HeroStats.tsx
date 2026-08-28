import { formatTally, GATE_SCORECARD, tallyGates } from "../../constants";
import { GateJumpLink } from "../GateJumpLink";

const SEGMENT_CLASSES = {
	open: "bg-brand",
	partial:
		"bg-[repeating-linear-gradient(135deg,var(--brand)_0,var(--brand)_3px,transparent_3px,transparent_6px)]",
	closed: "bg-foreground/10",
};

export function HeroStats() {
	const f3 = tallyGates("F3");
	const f4 = tallyGates("F4");

	return (
		<div className="mt-8 grid grid-cols-1 sm:grid-cols-3 border border-border divide-y sm:divide-y-0 sm:divide-x divide-border">
			<div className="px-4 py-3 md:px-5">
				<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
					Current level
				</span>
				<p className="text-lg font-mono text-foreground mt-1">
					F3 <span className="text-muted-foreground text-sm">· Delegated</span>
				</p>
			</div>
			<div className="px-4 py-3 md:px-5">
				<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
					Gates open
				</span>
				<p className="text-lg font-mono text-foreground mt-1">
					{formatTally(f3)}{" "}
					<span className="text-muted-foreground text-sm">F3</span>
					<span className="text-muted-foreground text-sm"> · </span>
					{formatTally(f4)}{" "}
					<span className="text-muted-foreground text-sm">F4</span>
				</p>
				<div className="flex gap-0.5 mt-2">
					{GATE_SCORECARD.map((score) => (
						<GateJumpLink
							key={score.gateId}
							targetId={`gate-${score.gateId}`}
							title={`${score.level} · ${score.gate} · ${score.status}`}
							className={`h-1.5 flex-1 hover:outline hover:outline-1 hover:outline-brand ${SEGMENT_CLASSES[score.status]}`}
						>
							<span className="sr-only">
								{score.level} {score.gate}: {score.status}
							</span>
						</GateJumpLink>
					))}
				</div>
			</div>
			<div className="px-4 py-3 md:px-5">
				<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
					F4 gate crossed
				</span>
				<p className="text-lg font-mono text-foreground mt-1">
					2027 <span className="text-muted-foreground text-sm">· forecast</span>
				</p>
			</div>
		</div>
	);
}
