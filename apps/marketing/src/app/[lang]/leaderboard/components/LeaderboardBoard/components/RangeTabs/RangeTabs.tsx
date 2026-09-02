"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Calendar } from "@superset/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { PillTabs } from "@/app/[lang]/components/PillTabs";
import type { LeaderboardPeriod } from "@/app/[lang]/utils/fetchLeaderboard";
import { formatRangeLabel } from "@/app/[lang]/utils/formatRangeLabel";

const PRESETS: Array<{ id: LeaderboardPeriod; label: MessageDescriptor }> = [
	{
		id: "all",
		label: msg({ message: "All" }),
	},
	{
		id: "7d",
		label: msg({ message: "7D" }),
	},
	{
		id: "30d",
		label: msg({ message: "30D" }),
	},
];

export interface RangeSelection {
	period: LeaderboardPeriod;
	custom?: DateRange;
}

interface RangeTabsProps {
	value: RangeSelection;
	onChange: (selection: RangeSelection) => void;
	earliest: Date;
	latest: Date;
}

export function RangeTabs({
	value,
	onChange,
	earliest,
	latest,
}: RangeTabsProps) {
	const { t } = useLingui();
	const customActive = Boolean(value.custom?.from && value.custom?.to);

	return (
		<PillTabs
			label={t({
				message: "Date range",
			})}
			value={customActive ? null : value.period}
			options={PRESETS.map((preset) => ({
				id: preset.id,
				label: t(preset.label),
			}))}
			onChange={(period) => onChange({ period })}
		>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						role="tab"
						aria-selected={customActive}
						className={`gap-2 font-mono text-xs uppercase tracking-wider rounded-[2px] ${
							customActive ? "border-brand text-brand bg-brand/5" : ""
						}`}
					>
						<CalendarIcon className="size-3.5" />
						{formatRangeLabel(
							value.custom,
							t({
								message: "Custom",
							}),
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-3" align="start">
					<Calendar
						mode="range"
						numberOfMonths={2}
						defaultMonth={
							value.custom?.from ??
							new Date(latest.getFullYear(), latest.getMonth() - 1, 1)
						}
						selected={value.custom}
						onSelect={(range) =>
							onChange({
								period: value.period,
								custom: range?.from && range?.to ? range : range,
							})
						}
						disabled={{ before: earliest, after: latest }}
					/>
				</PopoverContent>
			</Popover>
		</PillTabs>
	);
}
