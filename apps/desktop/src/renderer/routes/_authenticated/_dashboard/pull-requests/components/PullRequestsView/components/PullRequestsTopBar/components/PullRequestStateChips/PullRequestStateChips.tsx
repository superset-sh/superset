import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import type { PullRequestStateFilter } from "renderer/routes/_authenticated/_dashboard/pull-requests/stores/pullRequestsFilterStore";

interface PullRequestStateChipsProps {
	value: PullRequestStateFilter;
	onChange: (value: PullRequestStateFilter) => void;
}

const CHIP_CLASSNAME =
	"h-6 rounded-lg border-0 px-2 text-xs font-medium text-[#6e6c6a] dark:text-muted-foreground data-[state=on]:bg-[#eae8e6] data-[state=on]:text-[#373533] dark:data-[state=on]:bg-accent dark:data-[state=on]:text-accent-foreground";

export function PullRequestStateChips({
	value,
	onChange,
}: PullRequestStateChipsProps) {
	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={(next) => {
				if (next) onChange(next as PullRequestStateFilter);
			}}
			variant="outline"
			size="sm"
			aria-label="Filter by state"
			className="gap-1"
		>
			<ToggleGroupItem
				value="all"
				aria-label="Show items in all states"
				className={CHIP_CLASSNAME}
			>
				All
			</ToggleGroupItem>
			<ToggleGroupItem
				value="open"
				aria-label="Show open items"
				className={CHIP_CLASSNAME}
			>
				Open
			</ToggleGroupItem>
			<ToggleGroupItem
				value="merged"
				aria-label="Show merged items"
				className={CHIP_CLASSNAME}
			>
				Merged
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
