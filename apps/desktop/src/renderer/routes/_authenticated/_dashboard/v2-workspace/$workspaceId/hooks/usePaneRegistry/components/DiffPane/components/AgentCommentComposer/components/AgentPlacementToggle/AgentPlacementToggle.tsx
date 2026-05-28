import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { LuColumns2, LuPanelTopOpen } from "react-icons/lu";
import type { AgentSessionPlacement } from "../../hooks/useDiffCommentTarget";

interface AgentPlacementToggleProps {
	value: AgentSessionPlacement;
	onValueChange: (next: string) => void;
}

export function AgentPlacementToggle({
	value,
	onValueChange,
}: AgentPlacementToggleProps) {
	return (
		<ToggleGroup
			type="single"
			size="sm"
			value={value}
			onValueChange={onValueChange}
			className="ml-1 h-7 gap-0 rounded-md border border-border/60 bg-popover p-0.5"
		>
			<ToggleGroupItem
				value="split-pane"
				aria-label="Open in split pane"
				title="Split pane"
				className="h-6 gap-1 rounded-[4px] px-1.5 text-[11px] text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
			>
				<LuColumns2 className="size-3" />
				<span>Split</span>
			</ToggleGroupItem>
			<ToggleGroupItem
				value="new-tab"
				aria-label="Open in new tab"
				title="New tab"
				className="h-6 gap-1 rounded-[4px] px-1.5 text-[11px] text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
			>
				<LuPanelTopOpen className="size-3" />
				<span>New tab</span>
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
