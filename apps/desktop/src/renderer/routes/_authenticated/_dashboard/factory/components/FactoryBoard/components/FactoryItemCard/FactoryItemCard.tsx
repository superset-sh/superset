import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { LuCirclePlay } from "react-icons/lu";
import {
	DISPATCHABLE_STAGES,
	type FactoryItem,
	type FactoryLatestRun,
} from "../../../../constants";

interface FactoryItemCardProps {
	item: FactoryItem;
	latestRun: FactoryLatestRun | undefined;
	onOpen: () => void;
	onRun: () => void;
	runPending: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

/** Time-in-stage chip, shown only once the item stops being fresh (<4h). */
function stageAgeChip(
	item: FactoryItem,
): { label: string; className: string } | null {
	if (item.stage === "done" || item.stage === "rejected") return null;
	const hours =
		(Date.now() - new Date(item.stageEnteredAt).getTime()) / HOUR_MS;
	if (hours < 4) return null;
	const label =
		hours < 48 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
	if (hours < 24)
		return {
			label,
			className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
		};
	if (hours < 72)
		return {
			label,
			className: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
		};
	return { label, className: "bg-red-500/15 text-red-600 dark:text-red-400" };
}

function runDotColor(run: FactoryLatestRun | undefined): string {
	if (!run) return "bg-muted-foreground/40";
	if (run.status === "dispatch_failed" || run.status === "skipped_offline")
		return "bg-red-500";
	// Queued (not yet on a host) and running must not look alike.
	if (run.status === "dispatching")
		return "bg-muted-foreground/60 animate-pulse";
	if (run.status === "dispatched") return "bg-blue-500 animate-pulse";
	if (run.outcome === "success") return "bg-green-500";
	if (run.outcome === "blocked" || run.outcome === "flawed")
		return "bg-amber-500";
	return "bg-muted-foreground/40";
}

const KIND_CHIP: Record<string, string> = {
	bug: "bg-red-500/10 text-red-600 dark:text-red-400",
	feature: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
	docs: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
	question: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

export function FactoryItemCard({
	item,
	latestRun,
	onOpen,
	onRun,
	runPending,
}: FactoryItemCardProps) {
	const canRun = DISPATCHABLE_STAGES.has(item.stage);
	const ageChip = stageAgeChip(item);
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group flex flex-col gap-2 rounded-md border border-border bg-background p-3 text-left shadow-sm transition-all hover:border-border/80 hover:bg-fill-hover"
		>
			<div className="flex items-start gap-2">
				<span
					className={cn(
						"mt-[5px] size-1.5 shrink-0 rounded-full",
						runDotColor(latestRun),
					)}
				/>
				<span className="line-clamp-2 flex-1 text-[13px] font-medium leading-snug">
					{item.title}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
				<span className="tabular-nums text-muted-foreground/80">
					#{item.externalNumber}
				</span>
				{item.authorLogin && (
					<span className="text-muted-foreground/60">{item.authorLogin}</span>
				)}
				{item.kind && (
					<span
						className={cn(
							"rounded px-1.5 py-px font-medium",
							KIND_CHIP[item.kind] ?? "bg-fill-secondary",
						)}
					>
						{item.kind}
						{item.confidence != null ? ` ${item.confidence}%` : ""}
					</span>
				)}
				{item.prNumber != null && (
					<span className="rounded bg-fill-secondary px-1.5 py-px font-medium">
						PR #{item.prNumber}
					</span>
				)}
				{ageChip && (
					<span
						title={`${ageChip.label} in ${item.stage}`}
						className={cn(
							"rounded px-1.5 py-px font-medium tabular-nums",
							ageChip.className,
						)}
					>
						{ageChip.label}
					</span>
				)}
				<span className="flex-1" />
				{canRun && (
					<Button
						size="sm"
						variant="ghost"
						disabled={runPending}
						className="h-5 gap-1 px-1.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
						onClick={(event) => {
							event.stopPropagation();
							onRun();
						}}
					>
						<LuCirclePlay className="size-3" />
						Run
					</Button>
				)}
			</div>
			{item.blockedReason && (
				<p className="line-clamp-2 select-text cursor-text rounded bg-amber-500/10 px-1.5 py-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
					{item.blockedReason}
				</p>
			)}
		</button>
	);
}
