"use client";

import { Trans } from "@lingui/react/macro";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import type { StarHistoryPoint } from "../../utils/getStarHistory";
import {
	aggregateToWeekly,
	computePeriodDeltas,
	DAY_MS,
	parseLocalDate,
	toLocalDateString,
	WEEK_MS,
} from "../../utils/starPace";
import { DateRangePicker } from "../DateRangePicker";
import { StarHistoryChart } from "../StarHistoryChart";
import { StarPaceChart } from "../StarPaceChart";

interface StarChartSectionProps {
	points: StarHistoryPoint[];
}

export function StarChartSection({ points }: StarChartSectionProps) {
	const [range, setRange] = useState<DateRange | undefined>(undefined);
	const [granularity, setGranularity] = useState<"day" | "week">("week");

	const bounds = useMemo(() => {
		const first = points[0];
		const last = points[points.length - 1];
		return {
			from: first ? parseLocalDate(first.date) : new Date(),
			to: last ? parseLocalDate(last.date) : new Date(),
		};
	}, [points]);

	const weeklyPoints = useMemo(() => aggregateToWeekly(points), [points]);

	const sourcePoints = granularity === "day" ? points : weeklyPoints;

	const filteredPoints = useMemo(() => {
		if (!range?.from) return sourcePoints;
		// Compare as calendar-day strings, not timestamps — range.from/to are
		// local-midnight Dates from the Calendar, point.date is a UTC-midnight
		// string, and comparing those as raw timestamps drifts by a day for
		// any non-UTC visitor.
		const fromDate = toLocalDateString(range.from);
		const toDate = toLocalDateString(range.to ?? range.from);
		return sourcePoints.filter(
			(point) => point.date >= fromDate && point.date <= toDate,
		);
	}, [sourcePoints, range]);

	const deltas = useMemo(
		() =>
			computePeriodDeltas(
				filteredPoints,
				granularity === "day" ? DAY_MS : WEEK_MS,
			),
		[filteredPoints, granularity],
	);

	return (
		<div className="space-y-6">
			<div className="flex justify-end gap-2">
				<ToggleGroup
					type="single"
					variant="outline"
					size="sm"
					value={granularity}
					onValueChange={(value) => {
						if (value) setGranularity(value as "day" | "week");
					}}
				>
					<ToggleGroupItem value="day" className="font-mono text-xs">
						<Trans>Day</Trans>
					</ToggleGroupItem>
					<ToggleGroupItem value="week" className="font-mono text-xs">
						<Trans>Week</Trans>
					</ToggleGroupItem>
				</ToggleGroup>
				<DateRangePicker
					range={range}
					onRangeChange={setRange}
					fromDate={bounds.from}
					toDate={bounds.to}
				/>
			</div>
			{filteredPoints.length > 1 ? (
				<div className="space-y-10">
					<StarHistoryChart points={filteredPoints} granularity={granularity} />
					<div>
						<span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
							{granularity === "day" ? (
								<Trans>Stars gained per day</Trans>
							) : (
								<Trans>Stars gained per week</Trans>
							)}
						</span>
						<div className="mt-3">
							<StarPaceChart deltas={deltas} granularity={granularity} />
						</div>
					</div>
				</div>
			) : (
				<div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
					<Trans>No stars in this range.</Trans>
				</div>
			)}
		</div>
	);
}
