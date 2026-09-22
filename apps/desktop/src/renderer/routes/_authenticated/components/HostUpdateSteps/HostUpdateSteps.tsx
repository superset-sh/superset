import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { HostUpdateStage } from "renderer/hooks/host-service/useHostServiceUpdate";
import { useNow } from "renderer/hooks/useNow";

interface HostUpdateStepsProps {
	stage: HostUpdateStage;
	startedAt: number | null;
	className?: string;
}

const ORDER: HostUpdateStage[] = [
	"downloading",
	"restarting",
	"reconnecting",
	"updated",
];

/**
 * The four visible steps of a host-service update. Inline rather than a
 * toast because the whole thing takes tens of seconds and the reader should
 * be able to leave and come back.
 */
export function HostUpdateSteps({
	stage,
	startedAt,
	className,
}: HostUpdateStepsProps) {
	const now = useNow(1_000);
	const current = ORDER.indexOf(stage);
	if (current === -1) return null;
	const elapsed =
		startedAt === null
			? 0
			: Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
	const labels = [
		<Trans key="d">Downloading</Trans>,
		<Trans key="r">Restarting</Trans>,
		<Trans key="c">Reconnecting</Trans>,
		<Trans key="u">Updated</Trans>,
	];
	return (
		<div className={cn("flex gap-2.5", className)} aria-live="polite">
			{ORDER.map((step, index) => {
				const done = index < current || stage === "updated";
				const active = index === current && stage !== "updated";
				return (
					<div key={step} className="flex min-w-0 flex-1 flex-col gap-1">
						<div
							className={cn(
								"h-0.5 rounded-full",
								done && "bg-emerald-500",
								active && "bg-emerald-500/50 animate-pulse",
								!done && !active && "bg-border",
							)}
						/>
						<span
							className={cn(
								"truncate text-[11px] tabular-nums",
								done || active ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{labels[index]}
							{active && elapsed > 0 ? ` · ${elapsed}s` : null}
						</span>
					</div>
				);
			})}
		</div>
	);
}
