"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { LuClock, LuMoveDownRight, LuMoveRight } from "react-icons/lu";

export interface FunnelStep {
	name: string;
	count: number;
	medianSeconds: number | null;
	averageSeconds: number | null;
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

function TooltipRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-6">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-foreground font-mono font-medium tabular-nums">
				{value}
			</span>
		</div>
	);
}

function TooltipHeader({ step, name }: { step: number; name: string }) {
	return (
		<div className="flex items-center gap-1.5 pb-1 font-medium">
			<span
				className="size-2 shrink-0 rounded-full"
				style={{ background: "var(--chart-1)" }}
			/>
			<Trans>
				Step {step}: {name}
			</Trans>
		</div>
	);
}

// PostHog-style funnel: one column per step, solid fill = % of step 1,
// hatched remainder = drop-off. Hovering the solid region shows conversion
// stats; hovering the hatched region shows drop-off stats.
export function FunnelChart({
	title,
	description,
	steps,
	isLoading,
	error,
	headerAction,
}: FunnelChartProps) {
	const { t } = useLingui();
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
							<Trans>Failed to load funnel data</Trans>
						</p>
					</div>
				) : !steps || steps.length === 0 ? (
					<div className="flex h-[220px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							<Trans>No funnel data available for this period</Trans>
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
								const droppedPctOfStart =
									dropped !== null && firstCount > 0
										? (dropped / firstCount) * 100
										: null;
								return (
									<div
										key={step.name + String(index)}
										className="border-border/60 flex flex-col gap-2 border-l px-2 first:border-l-0"
									>
										<div className="relative h-[160px] overflow-hidden rounded-sm">
											{pctOfFirst < 100 ? (
												<Tooltip>
													<TooltipTrigger asChild>
														<div
															className="absolute inset-x-0 top-0"
															style={{
																height: `${100 - pctOfFirst}%`,
																background: HATCH_BACKGROUND,
															}}
														/>
													</TooltipTrigger>
													<TooltipContent
														side="top"
														className="border-border/50 bg-background text-foreground grid gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
													>
														<TooltipHeader step={index + 1} name={step.name} />
														{dropped !== null ? (
															<TooltipRow
																label={t({
																	message: "Dropped off",
																})}
																value={dropped.toLocaleString()}
															/>
														) : null}
														{pctOfPrevious !== null ? (
															<TooltipRow
																label={t({
																	message: "Drop-off from previous",
																})}
																value={`${(100 - pctOfPrevious).toFixed(2)}%`}
															/>
														) : null}
														{droppedPctOfStart !== null ? (
															<TooltipRow
																label={t({
																	message: "Drop-off from start",
																})}
																value={`${droppedPctOfStart.toFixed(2)}%`}
															/>
														) : null}
													</TooltipContent>
												</Tooltip>
											) : null}
											<Tooltip>
												<TooltipTrigger asChild>
													<div
														className="absolute inset-x-0 bottom-0 rounded-sm"
														style={{
															height: `${pctOfFirst}%`,
															background: "var(--chart-1)",
														}}
													/>
												</TooltipTrigger>
												<TooltipContent
													side="top"
													className="border-border/50 bg-background text-foreground grid gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
												>
													<TooltipHeader step={index + 1} name={step.name} />
													<TooltipRow
														label={t({
															message: "Converted",
														})}
														value={step.count.toLocaleString()}
													/>
													{pctOfPrevious !== null ? (
														<TooltipRow
															label={t({
																message: "Conversion from previous",
															})}
															value={`${pctOfPrevious.toFixed(2)}%`}
														/>
													) : null}
													<TooltipRow
														label={t({
															message: "Conversion so far",
														})}
														value={`${pctOfFirst.toFixed(2)}%`}
													/>
													{step.medianSeconds !== null && index > 0 ? (
														<TooltipRow
															label={t({
																message: "Median time from previous",
															})}
															value={formatDuration(step.medianSeconds)}
														/>
													) : null}
													{step.averageSeconds !== null && index > 0 ? (
														<TooltipRow
															label={t({
																message: "Average time from previous",
															})}
															value={formatDuration(step.averageSeconds)}
														/>
													) : null}
												</TooltipContent>
											</Tooltip>
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
													{t({
														message: `${step.count.toLocaleString()} persons`,
													})}
													{pctOfPrevious !== null
														? ` (${pctOfPrevious.toFixed(1)}%)`
														: ""}
												</span>
											</div>
											{dropped !== null && pctOfPrevious !== null ? (
												<div className="text-muted-foreground flex items-center gap-1 tabular-nums">
													<LuMoveDownRight className="size-3 shrink-0 text-red-500" />
													<span>
														{t({
															message: `${dropped.toLocaleString()} persons`,
														})}{" "}
														({(100 - pctOfPrevious).toFixed(1)}%)
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
