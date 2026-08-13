"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import type { ReactNode } from "react";

interface InsightTileFrameProps {
	title: string;
	description?: string;
	lastRefresh?: string | null;
	isLoading?: boolean;
	error?: { message: string } | null;
	empty?: boolean;
	emptyLabel?: string;
	headerAction?: ReactNode;
	children: ReactNode;
}

export function InsightTileFrame({
	title,
	description,
	lastRefresh,
	isLoading,
	error,
	empty,
	emptyLabel = "No data",
	headerAction,
	children,
}: InsightTileFrameProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="truncate">{title}</CardTitle>
					{headerAction}
					{lastRefresh ? (
						<span className="text-muted-foreground shrink-0 text-xs">
							{new Date(lastRefresh).toLocaleString(undefined, {
								month: "short",
								day: "numeric",
								hour: "numeric",
								minute: "2-digit",
							})}
						</span>
					) : null}
				</div>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-4/5" />
						<Skeleton className="h-6 w-3/5" />
					</div>
				) : error ? (
					<div className="flex h-[200px] items-center justify-center">
						<p className="text-destructive select-text cursor-text text-sm">
							{error.message}
						</p>
					</div>
				) : empty ? (
					<div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">{emptyLabel}</p>
					</div>
				) : (
					children
				)}
			</CardContent>
		</Card>
	);
}
