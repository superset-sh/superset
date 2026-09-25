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
				<Trans>State</Trans>
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
					message: "Filter by state",
				})}
				className="h-8 rounded-md border-0 bg-muted/50 p-0.5"
			>
				<ToggleGroupItem
					value="open"
					aria-label={t({
						message: "Show open items",
					})}
					className="h-7 border-0 px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground"
				>
					<Trans context="status">Open</Trans>
				</ToggleGroupItem>
				<ToggleGroupItem
					value="all"
					aria-label={t({
						message: "Show items in all states",
					})}
					className="h-7 border-0 px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground"
				>
					<Trans>All</Trans>
				</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
}
