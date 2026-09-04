"use client";

import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

export interface MrrDatum {
	date: string;
	mrrUsd: number;
	prevDate: string | null;
	prevUsd: number | null;
	changePct: number | null;
}

interface MrrTooltipProps {
	active?: boolean;
	payload?: { payload: MrrDatum }[];
}

export function MrrTooltip({ active, payload }: MrrTooltipProps) {
	const datum = payload?.[0]?.payload;
	if (!active || !datum) return null;

	return (
		<div className="border-border/50 bg-background min-w-[11rem] rounded-lg border px-3 py-2 text-xs shadow-xl">
			<div className="flex items-center justify-between gap-4 pb-1">
				<span className="font-medium">
					<Trans>MRR</Trans>
				</span>
				{datum.changePct !== null ? (
					<span
						className={cn(
							"font-medium",
							datum.changePct >= 0 ? "text-green-500" : "text-red-500",
						)}
					>
						{datum.changePct >= 0 ? "+" : ""}
						{datum.changePct.toFixed(2)}%
					</span>
				) : null}
			</div>
			<div className="flex items-center justify-between gap-4">
				<span>{datum.date}</span>
				<span className="font-medium tabular-nums">
					${datum.mrrUsd.toLocaleString()}
				</span>
			</div>
			{datum.prevDate && datum.prevUsd !== null ? (
				<div className="text-muted-foreground flex items-center justify-between gap-4">
					<span>{datum.prevDate}</span>
					<span className="tabular-nums">
						${datum.prevUsd.toLocaleString()}
					</span>
				</div>
			) : null}
		</div>
	);
}
