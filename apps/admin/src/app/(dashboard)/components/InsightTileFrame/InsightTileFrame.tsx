"use client";

import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
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
import { LuExternalLink, LuRefreshCw } from "react-icons/lu";

interface InsightTileFrameProps {
	title: string;
	description?: string;
	lastRefresh?: string | null;
	isLoading?: boolean;
	error?: { message: string } | null;
	empty?: boolean;
	emptyLabel?: string;
	headerAction?: ReactNode;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	href?: string;
	children: ReactNode;
}

export function InsightTileFrame({
	title,
	description,
	lastRefresh,
	isLoading,
	error,
	empty,
	emptyLabel,
	headerAction,
	onRefresh,
	isRefreshing,
	href,
	children,
}: InsightTileFrameProps) {
	const { t } = useLingui();

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					{href ? (
						<a
							href={href}
							target="_blank"
							rel="noreferrer"
							className="flex min-w-0 items-center gap-1.5 hover:underline"
						>
							<CardTitle className="truncate">{title}</CardTitle>
							<LuExternalLink className="text-muted-foreground size-3.5 shrink-0" />
						</a>
					) : (
						<CardTitle className="truncate">{title}</CardTitle>
					)}
					<div className="flex shrink-0 items-center gap-2">
						{headerAction}
						{onRefresh ? (
							<Button
								size="sm"
								variant="ghost"
								className="size-6 p-0"
								onClick={onRefresh}
								disabled={isRefreshing}
								aria-label={t({ message: "Refresh" })}
							>
								<LuRefreshCw
									className={cn("size-3.5", isRefreshing && "animate-spin")}
								/>
							</Button>
						) : null}
						{lastRefresh ? (
							<span className="text-muted-foreground text-xs">
								{new Date(lastRefresh).toLocaleString(undefined, {
									month: "short",
									day: "numeric",
									hour: "numeric",
									minute: "2-digit",
								})}
							</span>
						) : null}
					</div>
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
						<p className="text-muted-foreground text-sm">
							{emptyLabel ?? t({ message: "No data" })}
						</p>
					</div>
				) : (
					children
				)}
			</CardContent>
		</Card>
	);
}
