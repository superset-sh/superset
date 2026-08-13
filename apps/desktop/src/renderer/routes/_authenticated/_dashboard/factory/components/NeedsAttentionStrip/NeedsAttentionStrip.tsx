import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import type { FactoryItem, FactoryLatestRun } from "../../constants";

const HOUR_MS = 60 * 60 * 1000;

interface AttentionEntry {
	item: FactoryItem;
	reason: string;
	severity: number; // higher = worse
	className: string;
}

function ageLabel(since: string | Date): string {
	const hours = (Date.now() - new Date(since).getTime()) / HOUR_MS;
	if (hours < 1) return "<1h";
	if (hours < 48) return `${Math.round(hours)}h`;
	return `${Math.round(hours / 24)}d`;
}

/**
 * The reviewer's inbox, Linear-Triage style: renders only when something
 * needs a human — its absence is the health signal.
 */
export function NeedsAttentionStrip({
	items,
	latestRuns,
	onOpenItem,
}: {
	items: FactoryItem[];
	latestRuns: FactoryLatestRun[];
	onOpenItem: (itemId: string) => void;
}) {
	const entries = useMemo(() => {
		const runByItem = new Map(latestRuns.map((run) => [run.itemId, run]));
		const list: AttentionEntry[] = [];
		for (const item of items) {
			if (item.stage === "done" || item.stage === "rejected") continue;
			const run = runByItem.get(item.id);
			if (
				run &&
				(run.status === "dispatch_failed" || run.status === "skipped_offline")
			) {
				list.push({
					item,
					reason: `${run.stage} dispatch failed · ${ageLabel(run.createdAt)}`,
					severity: 3,
					className:
						"bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
				});
			} else if (item.blockedReason) {
				list.push({
					item,
					reason: `blocked in ${item.stage} · ${ageLabel(item.stageEnteredAt)}`,
					severity: 2,
					className:
						"bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
				});
			} else if (item.stage === "human_review") {
				list.push({
					item,
					reason: `awaiting review · ${ageLabel(item.stageEnteredAt)}`,
					severity: 1,
					className:
						"bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
				});
			}
		}
		return list.sort(
			(a, b) =>
				b.severity - a.severity ||
				new Date(a.item.stageEnteredAt).getTime() -
					new Date(b.item.stageEnteredAt).getTime(),
		);
	}, [items, latestRuns]);

	if (entries.length === 0) return null;

	return (
		<div className="flex shrink-0 items-center gap-2 overflow-x-auto">
			<span className="shrink-0 text-xs font-medium text-muted-foreground">
				Needs attention
			</span>
			{entries.map(({ item, reason, className }) => (
				<button
					key={item.id}
					type="button"
					onClick={() => onOpenItem(item.id)}
					className="flex shrink-0 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left transition-colors hover:bg-fill-hover"
				>
					<span className="max-w-56 truncate text-xs font-medium">
						#{item.externalNumber} {item.title}
					</span>
					<span
						className={cn(
							"rounded border px-1.5 py-px text-[10px] font-medium",
							className,
						)}
					>
						{reason}
					</span>
				</button>
			))}
		</div>
	);
}
