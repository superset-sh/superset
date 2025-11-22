import type { Tab } from "main/lib/trpc/routers/tabs";
import { useRemoveTab } from "renderer/react-query/tabs";
import { TabContentContextMenu } from "./TabContentContextMenu";
import { Terminal } from "./Terminal";

interface SingleTabViewProps {
	tab: Tab & { type: "terminal" };
	isDropZone: boolean;
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	const removeTabMutation = useRemoveTab();

	// TODO: Implement split operations
	const handleSplitHorizontal = () => {
		console.log("Split horizontal not yet implemented");
	};

	const handleSplitVertical = () => {
		console.log("Split vertical not yet implemented");
	};

	const handleClosePane = () => {
		removeTabMutation.mutate({ id: tab.id });
	};

	return (
		<TabContentContextMenu
			onSplitHorizontal={handleSplitHorizontal}
			onSplitVertical={handleSplitVertical}
			onClosePane={handleClosePane}
		>
			<div className="w-full h-full overflow-hidden bg-background">
				<Terminal tab={tab} />
			</div>
		</TabContentContextMenu>
	);
}
