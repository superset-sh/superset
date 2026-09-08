"use client";

import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { useState } from "react";
import { LuMaximize2 } from "react-icons/lu";

import { InsightTileFrame } from "../../../components/InsightTileFrame";
import { PostHogQueryLink } from "../PostHogQueryLink";
import { TileDetailDialog } from "../TileDetailDialog";
import { type ChartSeries, WeeklySeriesChart } from "../WeeklySeriesChart";

interface WeeklyTileProps {
	title: string;
	description?: string;
	weeks: string[];
	series: ChartSeries[];
	query?: string;
	stacked?: boolean;
	lastRefresh?: string | null;
	isLoading?: boolean;
	error?: { message: string } | null;
	onRefresh?: () => void;
	isRefreshing?: boolean;
	headerAction?: ReactNode;
	// Content rendered above the chart (headline numbers).
	children?: ReactNode;
}

// The shape every weekly growth chart shares: a frame, the chart filling the
// tile, a PostHog link for the query, and an expand action for the drilldown.
export function WeeklyTile({
	title,
	description,
	weeks,
	series,
	query,
	stacked,
	lastRefresh,
	isLoading,
	error,
	onRefresh,
	isRefreshing,
	headerAction,
	children,
}: WeeklyTileProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	return (
		<>
			<InsightTileFrame
				title={title}
				description={description}
				lastRefresh={lastRefresh}
				isLoading={isLoading}
				error={error}
				onRefresh={onRefresh}
				isRefreshing={isRefreshing}
				empty={series.length === 0}
				fill
				headerAction={
					<>
						{headerAction}
						<PostHogQueryLink query={query} />
						<Button
							size="sm"
							variant="ghost"
							className="size-6 p-0"
							onClick={() => setOpen(true)}
							aria-label={t({ message: "Expand" })}
							title={t({ message: "Expand" })}
						>
							<LuMaximize2 className="size-3.5" />
						</Button>
					</>
				}
			>
				<div className="flex h-full min-h-0 flex-col gap-4">
					{children}
					<div className="min-h-[140px] flex-1">
						<WeeklySeriesChart
							weeks={weeks}
							series={series}
							stacked={stacked}
							fill
						/>
					</div>
				</div>
			</InsightTileFrame>
			<TileDetailDialog
				open={open}
				onOpenChange={setOpen}
				title={title}
				description={description}
				weeks={weeks}
				series={series}
				stacked={stacked}
				query={query}
			/>
		</>
	);
}
