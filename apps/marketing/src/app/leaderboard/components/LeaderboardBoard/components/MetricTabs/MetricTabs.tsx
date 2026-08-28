"use client";

import type { LeaderboardMetric } from "@/app/utils/fetchLeaderboard";
import { PillTabs } from "../PillTabs";

const METRICS: Array<{ id: LeaderboardMetric; label: string }> = [
	{ id: "tokens", label: "Tokens" },
	{ id: "cost", label: "Cost" },
];

interface MetricTabsProps {
	value: LeaderboardMetric;
	onChange: (metric: LeaderboardMetric) => void;
}

export function MetricTabs({ value, onChange }: MetricTabsProps) {
	return (
		<PillTabs
			label="Rank by"
			value={value}
			options={METRICS}
			onChange={onChange}
		/>
	);
}
