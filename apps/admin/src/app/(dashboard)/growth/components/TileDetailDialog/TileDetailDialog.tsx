"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import type { ReactNode } from "react";
import { LuDatabase } from "react-icons/lu";

import { formatDay } from "../../../utils/chartAxis";
import { posthogQueryUrl } from "../../utils/posthogQueryUrl";
import { type ChartSeries, WeeklySeriesChart } from "../WeeklySeriesChart";

interface TileDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	weeks: string[];
	series: ChartSeries[];
	stacked?: boolean;
	query?: string;
}

// The drilldown: the same chart at reading size, every number behind it as a
// table, and the query it came from for anyone who wants to go further.
export function TileDetailDialog({
	open,
	onOpenChange,
	title,
	description,
	weeks,
	series,
	stacked,
	query,
}: TileDetailDialogProps) {
	const { t } = useLingui();
	const totals = series.map((s) => s.values.reduce((sum, v) => sum + v, 0));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
				<DialogHeader>
					<div className="flex items-start justify-between gap-4 pr-6">
						<div>
							<DialogTitle>{title}</DialogTitle>
							{description ? (
								<DialogDescription>{description}</DialogDescription>
							) : null}
						</div>
						{query ? (
							<Button size="sm" variant="outline" asChild>
								<a
									href={posthogQueryUrl(query)}
									target="_blank"
									rel="noreferrer"
								>
									<LuDatabase className="size-3.5" />
									<Trans>Open in PostHog</Trans>
								</a>
							</Button>
						) : null}
					</div>
				</DialogHeader>
				<div className="min-h-0 flex-1 space-y-6 overflow-auto">
					<WeeklySeriesChart
						weeks={weeks}
						series={series}
						stacked={stacked}
						height={360}
					/>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="h-8 text-xs">
										{t({ message: "Week" })}
									</TableHead>
									{series.map((s) => (
										<TableHead key={s.key} className="h-8 text-right text-xs">
											{s.label}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{weeks.map((week, i) => (
									<TableRow key={week}>
										<TableCell className="py-1.5 text-sm">
											{formatDay(week)}
										</TableCell>
										{series.map((s) => (
											<TableCell
												key={s.key}
												className="py-1.5 text-right text-sm tabular-nums"
											>
												{formatNumber(s.values[i] ?? 0)}
											</TableCell>
										))}
									</TableRow>
								))}
								<TableRow>
									<TableCell className="py-1.5 text-sm font-medium">
										{t({ message: "Total" })}
									</TableCell>
									{series.map((s, i) => (
										<TableCell
											key={s.key}
											className="py-1.5 text-right text-sm font-medium tabular-nums"
										>
											{formatNumber(totals[i] ?? 0)}
										</TableCell>
									))}
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
