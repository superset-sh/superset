import { Trans, useLingui } from "@lingui/react/macro";
import {
	GATE_STATUS_LABELS,
	type GateScore,
	type GateStatus,
} from "../../constants";
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
	const { t } = useLingui();

	const counts: Record<GateStatus, number> = {
		open: 0,
		partial: 0,
		closed: 0,
	};
	for (const score of scores) {
		counts[score.status] += 1;
	}

	const openCount = counts.open;
	const partialCount = counts.partial;
	const closedCount = counts.closed;
	const total = scores.length;
	const countLabels: Record<GateStatus, string> = {
		open: t({
			message: `${openCount} open`,
		}),
		partial: t({
			message: `${partialCount} partial`,
		}),
		closed: t({
			message: `${closedCount} closed`,
		}),
	};

	return (
		<div>
			<div className="flex gap-0.5">
				{scores.map((score) => {
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
							className={`h-3 flex-1 hover:outline hover:outline-1 hover:outline-brand ${SEGMENT_CLASSES[score.status]}`}
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
			<p className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mt-2">
				{(Object.keys(counts) as GateStatus[]).map((status) => (
					<span key={status} className="text-muted-foreground">
						<span
							className={status === "closed" ? "" : "text-brand"}
							aria-hidden="true"
						>
							{GLYPHS[status]}
						</span>{" "}
						{countLabels[status]}
					</span>
				))}
				<span className="text-muted-foreground">
					<Trans>of {total} F3 and F4 gates</Trans>
				</span>
			</p>
		</div>
	);
}
