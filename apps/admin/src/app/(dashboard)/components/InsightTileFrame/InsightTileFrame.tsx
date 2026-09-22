"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Skeleton } from "@superset/ui/skeleton";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useState } from "react";
import { LuExternalLink, LuMaximize2, LuRefreshCw } from "react-icons/lu";

interface InsightTileFrameProps {
	title: string;
	// A node, not a string: an interpolated description has to be <Trans> JSX —
	// the macro cannot read a template literal the React Compiler has hoisted
	// into a variable, and silently emits an empty message when it tries.
	description?: ReactNode;
	lastRefresh?: string | null;
	isLoading?: boolean;
	error?: { message: string } | null;
	empty?: boolean;
	emptyLabel?: string;
	headerAction?: ReactNode;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	href?: string;
	// Stretch to the parent's height (a grid cell) and let the body scroll.
	fill?: boolean;
	// A tile with a drilldown of its own opts out of the generic one rather
	// than carrying two expand buttons.
	expandable?: boolean;
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
	fill,
	expandable = true,
	children,
}: InsightTileFrameProps) {
	const { formatDateTime } = useFormat();

	const { t } = useLingui();
	const [expanded, setExpanded] = useState(false);

	const body = isLoading ? (
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
	);

	return (
		<>
			<Card className={cn(fill && "flex h-full flex-col")}>
				<CardHeader>
					<div className="flex min-w-0 items-center justify-between gap-2">
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
							{expandable ? (
								<Button
									size="sm"
									variant="ghost"
									className="size-6 p-0"
									onClick={() => setExpanded(true)}
									aria-label={t({ message: "Expand" })}
									title={t({ message: "Expand" })}
								>
									<LuMaximize2 className="size-3.5" />
								</Button>
							) : null}
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
									{formatDateTime(new Date(lastRefresh), {
										month: "short",
										day: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</span>
							) : null}
						</div>
					</div>
					{/* Two lines are reserved whether or not the copy needs them: side
				    by side, a one-line description would otherwise start its chart
				    20px above its neighbour's. */}
					<CardDescription className="min-h-10">{description}</CardDescription>
				</CardHeader>
				<CardContent className={cn(fill && "min-h-0 flex-1 overflow-auto")}>
					{body}
				</CardContent>
			</Card>
			{expandable ? (
				<Dialog open={expanded} onOpenChange={setExpanded}>
					<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
						<DialogHeader>
							<DialogTitle>{title}</DialogTitle>
							{description ? (
								<DialogDescription>{description}</DialogDescription>
							) : null}
						</DialogHeader>
						{/* A chart sized by its container needs a definite height here
					    too, or it measures zero and draws nothing; a list only needs
					    a ceiling. */}
						<div
							className={cn(
								"min-h-0 overflow-auto",
								fill ? "h-[70vh]" : "max-h-[70vh]",
							)}
						>
							{body}
						</div>
					</DialogContent>
				</Dialog>
			) : null}
		</>
	);
}
