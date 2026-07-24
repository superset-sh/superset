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
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { ActivityDotGrid } from "@/components/ActivityDotGrid";
import { useTRPC } from "@/trpc/react";

const DAY_OPTIONS = [14, 30, 60, 90, 120];
const USER_COUNT_OPTIONS = [10, 25, 50, 100, 200];

export interface ActivityMatrixProps {
	domain: string;
}

/** Company-wide dot plot: one row per user, one column per day. */
export function ActivityMatrix({ domain }: ActivityMatrixProps) {
	const trpc = useTRPC();
	const [userCount, setUserCount] = useState(10);
	const [days, setDays] = useState(90);

	const matrix = useQuery(
		trpc.customers.domainActivityMatrix.queryOptions(
			{ domain, days, users: userCount },
			{ staleTime: 60_000, placeholderData: (previous) => previous },
		),
	);

	const data = matrix.data;

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between space-y-0">
				<div className="space-y-1.5">
					<CardTitle>Activity matrix</CardTitle>
					<CardDescription>
						Who did what, day by day, over the last {days} days
					</CardDescription>
				</div>
				<div className="flex items-center gap-2">
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
					<Select
						value={String(userCount)}
						onValueChange={(value) => setUserCount(Number(value))}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{USER_COUNT_OPTIONS.map((option) => (
								<SelectItem key={option} value={String(option)}>
									{option} users
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CardHeader>
			<CardContent>
				{matrix.isLoading && !data ? (
					<Skeleton className="h-48 w-full" />
				) : matrix.error ? (
					<p className="text-muted-foreground text-sm">
						Failed to load activity matrix — {matrix.error.message}
					</p>
				) : data ? (
					<ActivityDotGrid
						start={new Date(data.start)}
						days={data.days}
						isFetching={matrix.isFetching}
						prCells={data.prCells}
						rows={data.users.map((user) => ({
							key: user.userId,
							label: (
								<Link
									to="/users/$userId"
									params={{ userId: user.userId }}
									className="truncate text-xs hover:underline"
									title={user.email}
								>
									{user.name}
								</Link>
							),
							cells: user.cells,
							firstDayIndex: user.firstDayIndex,
						}))}
						footer={
							data.totalUsers > userCount ? (
								<span>
									Showing {data.users.length} of {data.totalUsers} users
								</span>
							) : null
						}
					/>
				) : null}
			</CardContent>
		</Card>
	);
}
