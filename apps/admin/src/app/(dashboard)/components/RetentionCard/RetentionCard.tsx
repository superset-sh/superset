"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";

interface WeekData {
	count: number;
	rate: number | null;
}

interface CohortRow {
	cohort: string;
	week0: WeekData;
	week1: WeekData;
	week2: WeekData;
	week3: WeekData;
	week4: WeekData;
}

interface RetentionCardProps {
	data: CohortRow[] | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
}

function RetentionCell({ week }: { week: WeekData }) {
	if (week.rate === null) {
		return <td className="text-muted-foreground px-3 py-2 text-center">—</td>;
	}

	// Color scale from green (high retention) to red (low retention)
	const rate = week.rate;
	const bgOpacity = Math.min(rate / 100, 1) * 0.3;
	const bgColor =
		rate >= 50
			? `rgba(34, 197, 94, ${bgOpacity})`
			: rate >= 25
				? `rgba(234, 179, 8, ${bgOpacity})`
				: `rgba(239, 68, 68, ${bgOpacity})`;

	return (
		<td
			className="px-3 py-2 text-center text-sm"
			style={{ backgroundColor: bgColor }}
		>
			{rate.toFixed(0)}%
		</td>
	);
}

export function RetentionCard({ data, isLoading, error }: RetentionCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">
					Weekly Cohort Retention
				</CardTitle>
				<CardDescription>
					% of users returning each week after signup (auth_completed)
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-40 w-full" />
				) : error ? (
					<div className="flex h-40 items-center justify-center">
						<p className="text-destructive text-sm">Failed to load</p>
					</div>
				) : data && data.length > 0 ? (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-muted-foreground border-b">
									<th className="px-3 py-2 text-left font-medium">Cohort</th>
									<th className="px-3 py-2 text-center font-medium">Size</th>
									<th className="px-3 py-2 text-center font-medium">Week 0</th>
									<th className="px-3 py-2 text-center font-medium">Week 1</th>
									<th className="px-3 py-2 text-center font-medium">Week 2</th>
									<th className="px-3 py-2 text-center font-medium">Week 3</th>
									<th className="px-3 py-2 text-center font-medium">Week 4</th>
								</tr>
							</thead>
							<tbody>
								{data.map((row) => (
									<tr key={row.cohort} className="border-b last:border-0">
										<td className="px-3 py-2 font-medium">{row.cohort}</td>
										<td className="px-3 py-2 text-center font-medium">
											{row.week0.count}
										</td>
										<RetentionCell week={row.week0} />
										<RetentionCell week={row.week1} />
										<RetentionCell week={row.week2} />
										<RetentionCell week={row.week3} />
										<RetentionCell week={row.week4} />
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className="flex h-40 items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No retention data available
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
