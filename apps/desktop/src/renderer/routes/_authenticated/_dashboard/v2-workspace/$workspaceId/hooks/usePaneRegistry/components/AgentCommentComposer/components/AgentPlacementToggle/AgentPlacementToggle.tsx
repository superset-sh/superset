import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
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
				aria-label={t({
					id: "workspace.agentCommentComposer.placementSplitAria",
					message: "Open in split pane",
				})}
				title={t({
					id: "workspace.agentCommentComposer.placementSplitTitle",
					message: "Split pane",
				})}
				className="h-6 gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
			>
				<LuColumns2 className="size-3" />
				<span>
					<Trans id="workspace.agentCommentComposer.placementSplit">
						Split
					</Trans>
				</span>
			</ToggleGroupItem>
			<ToggleGroupItem
				value="new-tab"
				aria-label={t({
					id: "workspace.agentCommentComposer.placementNewTabAria",
					message: "Open in new tab",
				})}
				title={t({
					id: "workspace.agentCommentComposer.placementNewTabTitle",
					message: "New tab",
				})}
				className="h-6 gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
			>
				<LuPanelTopOpen className="size-3" />
				<span>
					<Trans id="workspace.agentCommentComposer.placementNewTab">
						New tab
					</Trans>
				</span>
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
