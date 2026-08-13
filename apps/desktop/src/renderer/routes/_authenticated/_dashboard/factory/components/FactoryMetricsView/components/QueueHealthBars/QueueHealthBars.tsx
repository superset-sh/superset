import { useMemo } from "react";
import {
	BOARD_STAGES,
	type FactoryItem,
	STAGE_LABELS,
} from "../../../../constants";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Age buckets are a status palette (ordered position + gaps + legend +
 * tooltips as secondary encoding; emerald/amber/red validated for CVD and
 * normal-vision separation on the dark surface).
 */
const BUCKETS = [
	{ key: "fresh", label: "Fresh", range: "< 4h", color: "#059669", maxH: 4 },
	{ key: "aging", label: "Aging", range: "4–24h", color: "#f59e0b", maxH: 24 },
	{
		key: "stale",
		label: "Stale",
		range: "≥ 24h",
		color: "#ef4444",
		maxH: Number.POSITIVE_INFINITY,
	},
] as const;

function bucketOf(item: FactoryItem): (typeof BUCKETS)[number] {
	const hours =
		(Date.now() - new Date(item.stageEnteredAt).getTime()) / HOUR_MS;
	return BUCKETS.find((b) => hours < b.maxH) ?? BUCKETS[BUCKETS.length - 1];
}

interface QueueHealthBarsProps {
	items: FactoryItem[];
}

/** Live (not windowed): one segmented age bar per non-terminal stage. */
export function QueueHealthBars({ items }: QueueHealthBarsProps) {
	const rows = useMemo(() => {
		return BOARD_STAGES.filter(
			(stage) => stage !== "done" && stage !== "rejected",
		).map((stage) => {
			const stageItems = items.filter((item) => item.stage === stage);
			const counts = new Map<string, number>();
			for (const item of stageItems) {
				const bucket = bucketOf(item);
				counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
			}
			return { stage, total: stageItems.length, counts };
		});
	}, [items]);

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline gap-2">
				<span className="text-xs font-medium text-muted-foreground">
					Queue health
				</span>
				<span className="text-[11px] text-muted-foreground/70">
					live — time in current stage
				</span>
			</div>
			<div className="flex flex-col gap-1">
				{rows.map(({ stage, total, counts }) => (
					<div
						key={stage}
						className="grid grid-cols-[7rem_1fr_auto] items-center gap-2"
					>
						<span className="text-xs text-muted-foreground">
							{STAGE_LABELS[stage]}
						</span>
						{total === 0 ? (
							<div className="h-4 rounded border border-dashed border-border" />
						) : (
							<div className="flex h-4 gap-0.5 overflow-hidden rounded">
								{BUCKETS.map((bucket) => {
									const n = counts.get(bucket.key) ?? 0;
									if (n === 0) return null;
									return (
										<div
											key={bucket.key}
											title={`${bucket.label} (${bucket.range}): ${n}`}
											style={{ backgroundColor: bucket.color, flexGrow: n }}
											className="min-w-4 basis-0"
										/>
									);
								})}
							</div>
						)}
						<span className="text-xs tabular-nums text-muted-foreground">
							{total}
						</span>
					</div>
				))}
			</div>
			<div className="flex items-center gap-3">
				{BUCKETS.map((bucket) => (
					<span
						key={bucket.key}
						className="flex items-center gap-1 text-[10px] text-muted-foreground"
					>
						<span
							className="size-2 rounded-sm"
							style={{ backgroundColor: bucket.color }}
						/>
						{bucket.label} {bucket.range}
					</span>
				))}
			</div>
		</div>
	);
}
