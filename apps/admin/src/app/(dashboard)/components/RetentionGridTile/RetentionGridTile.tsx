"use client";

import { useLingui } from "@lingui/react/macro";
import {
	ADMIN_INSIGHTS,
	POSTHOG_PROJECT_URL,
} from "@superset/trpc/insight-registry";
import { useInsightResults } from "../../hooks/useInsightResults";
import { formatDay } from "../../utils/chartAxis";
import {
	type CohortCellState,
	CohortGrid,
	type CohortRow,
} from "../CohortGrid";
import { InsightTileFrame } from "../InsightTileFrame";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface RetentionCohortResult {
	date: string;
	label: string;
	values: { count: number }[];
}

function cellState(
	cohortStart: number,
	week: number,
	now: number,
): CohortCellState {
	const weekStart = cohortStart + week * WEEK_MS;
	if (weekStart > now) return "future";
	if (weekStart + WEEK_MS > now) return "inProgress";
	return "complete";
}

export function RetentionGridTile() {
	const { t } = useLingui();
	const query = useInsightResults("cohortRetention");

	const cohorts = Array.isArray(query.data?.result)
		? (query.data.result as RetentionCohortResult[]).filter((c) =>
				Array.isArray(c.values),
			)
		: [];
	const intervalCount = cohorts[0]?.values.length ?? 0;
	const now = Date.now();

	// Size-weighted mean per week over every cohort that has reached that
	// week; a week whose contributors are all mid-flight is itself dashed.
	const meanRow: CohortRow = {
		key: "mean",
		label: t({ message: "Mean" }),
		emphasis: true,
		size: cohorts.length
			? Math.round(
					cohorts.reduce((sum, c) => sum + (c.values[0]?.count ?? 0), 0) /
						cohorts.length,
				)
			: 0,
		cells: Array.from({ length: intervalCount }, (_, week) => {
			let returned = 0;
			let weight = 0;
			let sawComplete = false;
			for (const cohort of cohorts) {
				const size = cohort.values[0]?.count ?? 0;
				const state = cellState(new Date(cohort.date).getTime(), week, now);
				if (size === 0 || state === "future") continue;
				returned += cohort.values[week]?.count ?? 0;
				weight += size;
				if (state === "complete") sawComplete = true;
			}
			if (weight === 0) return { pct: null, state: "future" as const };
			return {
				pct: (returned / weight) * 100,
				state: sawComplete ? ("complete" as const) : ("inProgress" as const),
			};
		}),
	};

	const rows: CohortRow[] = [
		meanRow,
		...cohorts.map((cohort) => {
			const size = cohort.values[0]?.count ?? 0;
			const start = new Date(cohort.date).getTime();
			return {
				key: cohort.date,
				label: formatDay(cohort.date),
				size,
				cells: cohort.values.map((value, week) => ({
					pct: size > 0 ? (value.count / size) * 100 : null,
					state: cellState(start, week, now),
				})),
			};
		}),
	];

	return (
		<InsightTileFrame
			title={
				query.data?.name ??
				t({
					message: "Cohort retention",
				})
			}
			description={t({
				message:
					"Weekly cohorts by first real workspace; % returning with another workspace each week",
			})}
			lastRefresh={query.data?.lastRefresh}
			isLoading={query.isLoading || query.data?.result == null}
			error={query.error}
			empty={cohorts.length === 0}
			href={`${POSTHOG_PROJECT_URL}/insights/${ADMIN_INSIGHTS.cohortRetention}`}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
		>
			<CohortGrid
				columnLabels={Array.from({ length: intervalCount }, (_, week) =>
					t({ message: `Week ${week}` }),
				)}
				rows={rows}
			/>
		</InsightTileFrame>
	);
}
