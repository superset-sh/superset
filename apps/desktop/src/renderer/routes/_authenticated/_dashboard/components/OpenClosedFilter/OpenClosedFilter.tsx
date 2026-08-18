import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";

interface OpenClosedFilterProps {
	includeClosed: boolean;
	onChange: (includeClosed: boolean) => void;
}

export function OpenClosedFilter({
	includeClosed,
	onChange,
}: OpenClosedFilterProps) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-muted-foreground">State</span>
			<ToggleGroup
				type="single"
				value={includeClosed ? "all" : "open"}
				onValueChange={(value) => {
					if (value) onChange(value === "all");
				}}
				variant="outline"
				size="sm"
				aria-label="Filter by state"
				className="h-8 rounded-md border-0 bg-muted/50 p-0.5"
			>
				<ToggleGroupItem
					value="open"
					aria-label="Show open items"
					className="h-7 border-0 px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground"
				>
					Open
				</ToggleGroupItem>
				<ToggleGroupItem
					value="all"
					aria-label="Show items in all states"
					className="h-7 border-0 px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground"
				>
					All
				</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
}
