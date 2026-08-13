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
import { LuClock, LuMoveDownRight, LuMoveRight } from "react-icons/lu";

export interface FunnelStep {
	name: string;
	count: number;
	medianSeconds: number | null;
}

interface FunnelChartProps {
	title: string;
	description?: string;
	steps: FunnelStep[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	headerAction?: ReactNode;
}

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

const HATCH_BACKGROUND =
	"repeating-linear-gradient(135deg, color-mix(in oklch, var(--chart-1) 18%, transparent) 0 6px, color-mix(in oklch, var(--chart-1) 8%, transparent) 6px 12px)";

// PostHog-style funnel: one column per step, solid fill = % of step 1,
// hatched remainder = drop-off; converted/dropped counts and median
// conversion time below each column.
export function FunnelChart({
	title,
	description,
	steps,
	isLoading,
	error,
	headerAction,
}: FunnelChartProps) {
	const firstCount = steps?.[0]?.count ?? 0;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle>{title}</CardTitle>
					{headerAction}
				</div>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex gap-3">
						{Array.from({ length: 6 }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
							<Skeleton key={i} className="h-[220px] flex-1" />
						))}
					</div>
				) : error ? (
					<div className="flex h-[220px] items-center justify-center">
						<p className="text-destructive select-text cursor-text text-sm">
							Failed to load funnel data
						</p>
					</div>
				) : !steps || steps.length === 0 ? (
					<div className="flex h-[220px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No funnel data available for this period
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<div
							className="grid min-w-[720px] gap-0"
							style={{
								gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
							}}
						>
							{steps.map((step, index) => {
								const previous = index > 0 ? steps[index - 1] : null;
								const pctOfFirst =
									firstCount > 0 ? (step.count / firstCount) * 100 : 0;
								const pctOfPrevious =
									previous && previous.count > 0
										? (step.count / previous.count) * 100
										: null;
								const dropped = previous ? previous.count - step.count : null;
								return (
									<div
										key={step.name + String(index)}
										className="border-border/60 flex flex-col gap-2 border-l px-2 first:border-l-0"
									>
										<div
											className="relative h-[160px] overflow-hidden rounded-sm"
											style={{ background: HATCH_BACKGROUND }}
										>
											<div
												className="absolute inset-x-0 bottom-0 rounded-sm"
												style={{
													height: `${pctOfFirst}%`,
													background: "var(--chart-1)",
												}}
											/>
										</div>
										<div className="space-y-1 pb-1 text-xs">
											<div className="flex items-start gap-1.5">
												<span className="bg-muted text-muted-foreground rounded px-1 font-medium">
													{index + 1}
												</span>
												<span className="font-medium leading-tight">
													{step.name}
												</span>
											</div>
											<div className="flex items-center gap-1 tabular-nums">
												<LuMoveRight className="size-3 shrink-0 text-green-500" />
												<span>
													{step.count.toLocaleString()} persons
													{pctOfPrevious !== null
														? ` (${pctOfPrevious.toFixed(1)}%)`
														: ""}
												</span>
											</div>
											{dropped !== null && pctOfPrevious !== null ? (
												<div className="text-muted-foreground flex items-center gap-1 tabular-nums">
													<LuMoveDownRight className="size-3 shrink-0 text-red-500" />
													<span>
														{dropped.toLocaleString()} persons (
														{(100 - pctOfPrevious).toFixed(1)}%)
													</span>
												</div>
											) : null}
											{step.medianSeconds !== null && index > 0 ? (
												<div className="text-muted-foreground flex items-center gap-1 tabular-nums">
													<LuClock className="size-3 shrink-0" />
													<span>{formatDuration(step.medianSeconds)}</span>
												</div>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
