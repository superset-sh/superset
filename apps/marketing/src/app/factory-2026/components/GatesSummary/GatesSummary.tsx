import type { GateScore, GateStatus } from "../../constants";
import { GateJumpLink } from "../GateJumpLink";

interface GatesSummaryProps {
	scores: GateScore[];
}

const SEGMENT_CLASSES: Record<GateStatus, string> = {
	open: "bg-brand",
	partial:
		"bg-[repeating-linear-gradient(135deg,var(--brand)_0,var(--brand)_3px,transparent_3px,transparent_6px)]",
	closed: "bg-foreground/10",
};

const GLYPHS: Record<GateStatus, string> = {
	open: "●",
	partial: "◐",
	closed: "○",
};

export function GatesSummary({ scores }: GatesSummaryProps) {
	const counts: Record<GateStatus, number> = {
		open: 0,
		partial: 0,
		closed: 0,
	};
	for (const score of scores) {
		counts[score.status] += 1;
	}

	return (
		<div>
			<div className="flex gap-0.5">
				{scores.map((score) => (
					<GateJumpLink
						key={score.gateId}
						targetId={`gate-${score.gateId}`}
						title={`${score.level} · ${score.gate} · ${score.status}`}
						className={`h-3 flex-1 hover:outline hover:outline-1 hover:outline-brand ${SEGMENT_CLASSES[score.status]}`}
					>
						<span className="sr-only">
							{score.level} {score.gate}: {score.status}
						</span>
					</GateJumpLink>
				))}
			</div>
			<p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mt-2">
				{(Object.keys(counts) as GateStatus[]).map((status) => (
					<span key={status} className="text-muted-foreground">
						<span
							className={status === "closed" ? "" : "text-brand"}
							aria-hidden="true"
						>
							{GLYPHS[status]}
						</span>{" "}
						{counts[status]} {status}
					</span>
				))}
				<span className="text-muted-foreground">
					of {scores.length} F3 and F4 gates
				</span>
			</p>
		</div>
	);
}
