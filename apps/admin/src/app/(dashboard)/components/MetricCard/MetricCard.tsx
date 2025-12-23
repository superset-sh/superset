"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";

interface MetricCardProps {
	title: string;
	description?: string;
	value: number | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	formatter?: (value: number) => string;
}

export function MetricCard({
	title,
	description,
	value,
	isLoading,
	error,
	formatter = (v) => v.toLocaleString(),
}: MetricCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-9 w-24" />
				) : error ? (
					<p className="text-destructive text-sm">Failed to load</p>
				) : value !== null && value !== undefined ? (
					<p className="text-3xl font-bold">{formatter(value)}</p>
				) : (
					<p className="text-muted-foreground text-sm">No data</p>
				)}
			</CardContent>
		</Card>
	);
}
