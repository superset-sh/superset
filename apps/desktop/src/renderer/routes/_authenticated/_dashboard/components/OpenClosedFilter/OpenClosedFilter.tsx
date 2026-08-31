import { Trans, useLingui } from "@lingui/react/macro";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";

interface OpenClosedFilterProps {
	includeClosed: boolean;
	onChange: (includeClosed: boolean) => void;
}

export function OpenClosedFilter({
	includeClosed,
	onChange,
}: OpenClosedFilterProps) {
	const { t } = useLingui();
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-muted-foreground">
				<Trans id="dashboard.openClosedFilter.state">State</Trans>
			</span>
			<ToggleGroup
				type="single"
				value={includeClosed ? "all" : "open"}
				onValueChange={(value) => {
					if (value) onChange(value === "all");
				}}
				variant="outline"
				size="sm"
				aria-label={t({
					id: "dashboard.openClosedFilter.filterByState",
					message: "Filter by state",
				})}
				className="h-[var(--btn-h-lg)] rounded border-0 bg-muted/50 p-0.5"
			>
				<ToggleGroupItem
					value="open"
					aria-label={t({
						id: "dashboard.openClosedFilter.showOpenItems",
						message: "Show open items",
					})}
					className="h-[var(--btn-h-default)] border-0 px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground"
				>
					<Trans id="dashboard.openClosedFilter.open">Open</Trans>
				</ToggleGroupItem>
				<ToggleGroupItem
					value="all"
					aria-label={t({
						id: "dashboard.openClosedFilter.showAllStates",
						message: "Show items in all states",
					})}
					className="h-[var(--btn-h-default)] border-0 px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground"
				>
					<Trans id="dashboard.openClosedFilter.all">All</Trans>
				</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
}
