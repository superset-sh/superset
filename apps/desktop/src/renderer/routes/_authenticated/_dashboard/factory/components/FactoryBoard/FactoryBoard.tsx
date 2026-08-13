import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import {
	BOARD_STAGES,
	type FactoryItem,
	type FactoryLatestRun,
	STAGE_LABELS,
} from "../../constants";
import { FactoryItemCard } from "./components/FactoryItemCard";

const HOUR_MS = 60 * 60 * 1000;

/** Stage-age health (Mastra thresholds): fresh <4h, aging <24h, slow <72h, stalled beyond. */
function stageAgeHealth(
	stage: string,
	items: FactoryItem[],
): { className: string; title: string } | null {
	if (items.length === 0 || stage === "done" || stage === "rejected")
		return null;
	const oldest = Math.min(
		...items.map((item) => new Date(item.stageEnteredAt).getTime()),
	);
	const hours = (Date.now() - oldest) / HOUR_MS;
	const title = `oldest item: ${hours < 1 ? "<1" : Math.round(hours)}h in stage`;
	if (hours < 4) return { className: "bg-green-500", title };
	if (hours < 24) return { className: "bg-amber-500", title };
	if (hours < 72) return { className: "bg-orange-500", title };
	return { className: "bg-red-500", title };
}

interface FactoryBoardProps {
	items: FactoryItem[];
	latestRuns: FactoryLatestRun[];
	onOpenItem: (itemId: string) => void;
	onRunItem: (item: FactoryItem) => void;
	runPending: boolean;
}

export function FactoryBoard({
	items,
	latestRuns,
	onOpenItem,
	onRunItem,
	runPending,
}: FactoryBoardProps) {
	const latestRunByItem = useMemo(
		() => new Map(latestRuns.map((run) => [run.itemId, run])),
		[latestRuns],
	);
	const itemsByStage = useMemo(() => {
		const grouped = new Map<string, FactoryItem[]>();
		for (const item of items) {
			const list = grouped.get(item.stage) ?? [];
			list.push(item);
			grouped.set(item.stage, list);
		}
		return grouped;
	}, [items]);

	return (
		<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
			{BOARD_STAGES.map((stage) => {
				const stageItems = itemsByStage.get(stage) ?? [];
				const health = stageAgeHealth(stage, stageItems);
				return (
					<div
						key={stage}
						className={cn(
							"flex w-64 shrink-0 flex-col rounded-lg bg-fill-secondary/40",
							// The human gate is the reviewer's inbox — set it apart.
							stage === "human_review" && "ring-1 ring-blue-500/25",
						)}
					>
						<div className="flex items-center gap-2 px-3 py-2">
							<span
								className={cn(
									"text-xs font-medium text-muted-foreground",
									stage === "human_review" &&
										"text-blue-600 dark:text-blue-400",
								)}
							>
								{STAGE_LABELS[stage]}
							</span>
							<span className="text-xs tabular-nums text-muted-foreground/70">
								{stageItems.length}
							</span>
							{health && (
								<span
									title={health.title}
									className={cn("size-1.5 rounded-full", health.className)}
								/>
							)}
						</div>
						<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
							{(stage === "done" || stage === "rejected"
								? stageItems.slice(0, 5)
								: stageItems
							).map((item) => (
								<FactoryItemCard
									key={item.id}
									item={item}
									latestRun={latestRunByItem.get(item.id)}
									onOpen={() => onOpenItem(item.id)}
									onRun={() => onRunItem(item)}
									runPending={runPending}
								/>
							))}
							{(stage === "done" || stage === "rejected") &&
								stageItems.length > 5 && (
									<span className="px-1 text-[11px] text-muted-foreground">
										+{stageItems.length - 5} more
									</span>
								)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
