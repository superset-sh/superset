"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { useState } from "react";
import { formatTokens } from "@/app/[lang]/utils/formatUsage";
import {
	buildCalendar,
	type CalendarCell,
	type DailyTokens,
} from "./utils/buildCalendar";

const CELL = 10;
const GAP = 2;

const LEVEL_ALPHA = [0.06, 0.28, 0.5, 0.72, 1];

const WEEKDAY_SAMPLES = ["2024-01-01", "2024-01-03", "2024-01-05"] as const;

const weekdayRows = () =>
	WEEKDAY_SAMPLES.map((day) => ({
		label: formatDate(new Date(`${day}T00:00:00Z`), {
			weekday: "short",
			timeZone: "UTC",
		}),
		offset: CELL + GAP,
	}));

function monthLabel(weeks: CalendarCell[][], index: number): string {
	const first = weeks[index]?.[0];
	if (!first) return "";

	const month = first.day.slice(0, 7);
	const previous = weeks[index - 1]?.[0]?.day.slice(0, 7);
	if (month === previous) return "";

	return formatDate(new Date(`${first.day}T00:00:00Z`), {
		month: "short",
		timeZone: "UTC",
	});
}

interface ContributionGraphProps {
	daily: readonly DailyTokens[];
	endDay: string;
	rgb: string;
}

export function ContributionGraph({
	daily,
	endDay,
	rgb,
}: ContributionGraphProps) {
	const { t } = useLingui();
	const [active, setActive] = useState<CalendarCell | null>(null);
	const calendar = buildCalendar(daily, endDay);

	const clear = (cell: CalendarCell) =>
		setActive((current) => (current?.day === cell.day ? null : current));

	const legend = LEVEL_ALPHA.map((alpha) => (
		<span
			key={alpha}
			className="inline-block"
			style={{
				width: CELL,
				height: CELL,
				backgroundColor: `rgba(${rgb},${alpha})`,
			}}
		/>
	));

	return (
		<div>
			<div className="flex items-baseline justify-between gap-4 mb-4">
				<span className="font-mono text-[0.68rem] uppercase tracking-[0.11em] text-muted-foreground">
					<Trans>
						{formatTokens(calendar.total)} tokens over{" "}
						{String(calendar.activeDays)} active days
					</Trans>
				</span>
			</div>

			<div className="overflow-x-auto">
				<div className="flex" style={{ gap: GAP }}>
					<div
						className="flex flex-col shrink-0 pr-1"
						style={{ gap: GAP, marginTop: CELL + GAP }}
					>
						{weekdayRows().map((row) => (
							<span
								key={row.label}
								className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground/50 leading-none"
								style={{ height: CELL, marginTop: row.offset }}
							>
								{row.label}
							</span>
						))}
					</div>

					<div className="flex" style={{ gap: GAP }}>
						{calendar.weeks.map((week, index) => (
							<div
								key={week[0]?.day}
								className="flex flex-col"
								style={{ gap: GAP }}
							>
								<span
									className="font-mono text-[0.55rem] uppercase tracking-[0.08em] text-muted-foreground/50 leading-none whitespace-nowrap"
									style={{ height: CELL }}
								>
									{monthLabel(calendar.weeks, index)}
								</span>
								{week.map((cell) =>
									cell.inRange ? (
										<button
											type="button"
											key={cell.day}
											aria-label={t({
												message: `${formatTokens(cell.tokens)} tokens on ${cell.day}`,
											})}
											onMouseEnter={() => setActive(cell)}
											onFocus={() => setActive(cell)}
											onMouseLeave={() => clear(cell)}
											onBlur={() => clear(cell)}
											style={{
												width: CELL,
												height: CELL,
												backgroundColor: `rgba(${rgb},${LEVEL_ALPHA[cell.level]})`,
											}}
										/>
									) : (
										<span
											key={cell.day}
											style={{ width: CELL, height: CELL }}
										/>
									),
								)}
							</div>
						))}
					</div>
				</div>
			</div>

			<div className="flex items-center justify-between gap-4 mt-4 min-h-[1.5rem]">
				<span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground">
					{active ? (
						`${formatTokens(active.tokens)} · ${formatDate(
							new Date(`${active.day}T00:00:00Z`),
							{
								day: "numeric",
								month: "short",
								year: "numeric",
								timeZone: "UTC",
							},
						)}`
					) : (
						<Trans>
							Shade is relative to this developer&apos;s busiest day
						</Trans>
					)}
				</span>

				<span className="flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground shrink-0">
					{t({ message: "Less" })}
					{legend}
					{t({ message: "More" })}
				</span>
			</div>
		</div>
	);
}
