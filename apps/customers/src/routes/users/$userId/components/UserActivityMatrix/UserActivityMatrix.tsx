import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Skeleton } from "@superset/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ActivityDotGrid } from "@/components/ActivityDotGrid";
import { useTRPC } from "@/trpc/react";

const DAY_OPTIONS = [14, 30, 60, 90, 120];

export interface UserActivityMatrixProps {
	userId: string;
}

/** Single-row daily dot plot for one user. */
export function UserActivityMatrix({ userId }: UserActivityMatrixProps) {
	const trpc = useTRPC();
	const [days, setDays] = useState(90);

	const matrix = useQuery(
		trpc.customers.userActivityMatrix.queryOptions(
			{ userId, days },
			{ staleTime: 60_000, placeholderData: (previous) => previous },
		),
	);

	const data = matrix.data;

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between space-y-0">
				<div className="space-y-1.5">
					<CardTitle>Daily activity</CardTitle>
					<CardDescription>
						What they did, day by day, over the last {days} days
					</CardDescription>
				</div>
				<Select
					value={String(days)}
					onValueChange={(value) => setDays(Number(value))}
				>
					<SelectTrigger className="w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{DAY_OPTIONS.map((option) => (
							<SelectItem key={option} value={String(option)}>
								{option} days
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent>
				{matrix.isLoading && !data ? (
					<Skeleton className="h-24 w-full" />
				) : matrix.error ? (
					<p className="text-muted-foreground text-sm">
						Failed to load activity — {matrix.error.message}
					</p>
				) : data ? (
					<ActivityDotGrid
						start={new Date(data.start)}
						days={data.days}
						isFetching={matrix.isFetching}
						hideLabels
						rows={[
							{
								key: userId,
								label: null,
								cells: data.cells,
								firstDayIndex: data.firstDayIndex,
							},
						]}
					/>
				) : null}
			</CardContent>
		</Card>
	);
}
