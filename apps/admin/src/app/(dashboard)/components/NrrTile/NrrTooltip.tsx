"use client";

import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";

import { formatMonth } from "../../utils/chartAxis";

export interface NrrDatum {
	month: string;
	customers: number;
	startMrrUsd: number;
	retainedMrrUsd: number;
	expansionUsd: number;
	contractionUsd: number;
	churnUsd: number;
	nrrPct: number;
	partial: boolean;
}

interface NrrTooltipProps {
	active?: boolean;
	payload?: { payload: NrrDatum }[];
}

export function NrrTooltip({ active, payload }: NrrTooltipProps) {
	const { formatNumber } = useFormat();

	const datum = payload?.[0]?.payload;
	if (!active || !datum) return null;

	const usd = (value: number) =>
		`${value < 0 ? "-" : ""}$${formatNumber(Math.abs(value), undefined)}`;

	return (
		<div className="border-border/50 bg-background min-w-[13rem] rounded-lg border px-3 py-2 text-xs shadow-xl">
			<div className="flex items-center justify-between gap-4 pb-1">
				<span className="font-medium">
					{formatMonth(datum.month)}
					{datum.partial ? (
						<span className="text-muted-foreground">
							{" "}
							<Trans>(so far)</Trans>
						</span>
					) : null}
				</span>
				<span className="font-medium tabular-nums">
					{datum.nrrPct.toFixed(1)}%
				</span>
			</div>
			<div className="flex items-center justify-between gap-4">
				<span>
					<Trans>Start MRR ({datum.customers} customers)</Trans>
				</span>
				<span className="tabular-nums">{usd(datum.startMrrUsd)}</span>
			</div>
			<div className="text-muted-foreground flex items-center justify-between gap-4">
				<span>
					<Trans>Expansion</Trans>
				</span>
				<span className="tabular-nums">{usd(datum.expansionUsd)}</span>
			</div>
			<div className="text-muted-foreground flex items-center justify-between gap-4">
				<span>
					<Trans>Contraction</Trans>
				</span>
				<span className="tabular-nums">{usd(datum.contractionUsd)}</span>
			</div>
			<div className="text-muted-foreground flex items-center justify-between gap-4">
				<span>
					<Trans>Churn</Trans>
				</span>
				<span className="tabular-nums">{usd(datum.churnUsd)}</span>
			</div>
			<div className="flex items-center justify-between gap-4">
				<span>
					<Trans>Retained MRR</Trans>
				</span>
				<span className="font-medium tabular-nums">
					{usd(datum.retainedMrrUsd)}
				</span>
			</div>
		</div>
	);
}
