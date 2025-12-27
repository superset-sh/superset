"use client";

import { Button } from "@superset/ui/button";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

interface WeekPickerProps {
	/** Week offset from current week (0 = this week, -1 = last week, etc.) */
	weekOffset: number;
	onChange: (offset: number) => void;
	/** Minimum offset (how far back can we go). Default -12 (12 weeks back) */
	minOffset?: number;
}

function getWeekLabel(offset: number): string {
	const now = new Date();
	const startOfWeek = new Date(now);
	// Go to start of current week (Sunday)
	startOfWeek.setDate(now.getDate() - now.getDay() + offset * 7);

	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 6);

	const formatDate = (d: Date) =>
		d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

	if (offset === 0) {
		return "This week";
	}

	return `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;
}

export function WeekPicker({
	weekOffset,
	onChange,
	minOffset = -12,
}: WeekPickerProps) {
	const canGoBack = weekOffset > minOffset;
	const canGoForward = weekOffset < 0;

	return (
		<div className="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => onChange(weekOffset - 1)}
				disabled={!canGoBack}
			>
				<LuChevronLeft className="size-4" />
			</Button>
			<span className="min-w-[140px] text-center text-sm text-muted-foreground">
				{getWeekLabel(weekOffset)}
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => onChange(weekOffset + 1)}
				disabled={!canGoForward}
			>
				<LuChevronRight className="size-4" />
			</Button>
		</div>
	);
}
