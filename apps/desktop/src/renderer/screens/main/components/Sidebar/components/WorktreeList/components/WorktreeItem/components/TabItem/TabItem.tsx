import { SquareTerminal } from "lucide-react";
import type { Tab } from "shared/types";
import { Button } from "@superset/ui/button";

interface TabItemProps {
	tab: Tab;
	worktreeId: string;
	tabGroupId: string;
	selectedTabId?: string;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
}

export function TabItem({
	tab,
	worktreeId,
	tabGroupId,
	selectedTabId,
	onTabSelect,
}: TabItemProps) {
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={() => onTabSelect(worktreeId, tabGroupId, tab.id)}
			className={`w-full h-8 px-3 font-normal ${
				selectedTabId === tab.id
					? "bg-neutral-800 border border-neutral-700"
					: ""
			}`}
			style={{ justifyContent: "flex-start" }}
		>
			<SquareTerminal size={14} />
			<span className="truncate">{tab.name}</span>
		</Button>
	);
}
