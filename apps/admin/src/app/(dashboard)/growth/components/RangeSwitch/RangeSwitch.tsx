"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";

import {
	RANGE_WEEKS,
	type RangeWeeks,
	useGrowthRange,
} from "../../providers/GrowthRangeProvider";

export function RangeSwitch() {
	const { t } = useLingui();
	const { weeks, setWeeks } = useGrowthRange();

	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			value={String(weeks)}
			onValueChange={(value) => {
				if (value) setWeeks(Number(value) as RangeWeeks);
			}}
			aria-label={t({ message: "Time range" })}
		>
			{RANGE_WEEKS.map((option) => (
				<ToggleGroupItem
					key={option}
					value={String(option)}
					className="px-3 text-xs"
				>
					{t({ message: `${formatNumber(option)} weeks` })}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
