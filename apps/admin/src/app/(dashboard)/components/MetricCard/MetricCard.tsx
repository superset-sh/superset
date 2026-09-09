"use client";

import { Trans } from "@lingui/react/macro";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface MetricCardProps {
	title: string;
	description?: string;
	value: number | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	formatter?: (value: number) => string;
	headerAction?: ReactNode;
	className?: string;
}

export function MetricCard({
	title,
	description,
	value,
	isLoading,
	error,
	formatter = (v) => v.toLocaleString(),
	headerAction,
	className,
}: MetricCardProps) {
	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-medium">{title}</CardTitle>
					{headerAction}
				</div>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className="flex flex-1 items-center justify-center">
				{isLoading ? (
					<Skeleton className="h-9 w-24" />
				) : error ? (
					<p className="text-destructive text-sm">
						<Trans>Failed to load</Trans>
					</p>
				) : value !== null && value !== undefined ? (
					<p className="text-3xl font-bold">{formatter(value)}</p>
				) : (
					<p className="text-muted-foreground text-sm">
						<Trans>No data</Trans>
					</p>
				)}
			</CardContent>
		</Card>
	);
}
