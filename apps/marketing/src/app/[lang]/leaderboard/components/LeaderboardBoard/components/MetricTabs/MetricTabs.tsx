"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { PillTabs } from "@/app/[lang]/components/PillTabs";
import type { LeaderboardMetric } from "@/app/[lang]/utils/fetchLeaderboard";

const METRICS: Array<{ id: LeaderboardMetric; label: MessageDescriptor }> = [
	{
		id: "tokens",
		label: msg({
			id: "marketing.leaderboard.metric.tokens",
			message: "Tokens",
		}),
	},
	{
		id: "cost",
		label: msg({ id: "marketing.leaderboard.metric.cost", message: "Cost" }),
	},
];

interface MetricTabsProps {
	value: LeaderboardMetric;
	onChange: (metric: LeaderboardMetric) => void;
}

export function MetricTabs({ value, onChange }: MetricTabsProps) {
	const { t } = useLingui();

	return (
		<PillTabs
			label={t({
				id: "marketing.leaderboard.metric.ariaLabel",
				message: "Rank by",
			})}
			value={value}
			options={METRICS.map((metric) => ({
				id: metric.id,
				label: t(metric.label),
			}))}
			onChange={onChange}
		/>
	);
}
