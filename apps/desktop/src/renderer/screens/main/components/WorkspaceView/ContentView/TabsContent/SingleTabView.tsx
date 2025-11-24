import type { Tab } from "main/lib/trpc/routers/tabs";
import { useRemoveTab, useSplit } from "renderer/react-query/tabs";
import { TabContentContextMenu } from "./TabContentContextMenu";
import { Terminal } from "./Terminal";

interface SingleTabViewProps {
	tab: Tab & { type: "terminal" };
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	const removeTabMutation = useRemoveTab();
	const splitMutation = useSplit();

	const handleSplitHorizontal = () => {
		splitMutation.mutate({
			tabId: tab.id,
			direction: "column", // Horizontal split = column direction in Mosaic
		});
	};

	const handleSplitVertical = () => {
		splitMutation.mutate({
			tabId: tab.id,
			direction: "row", // Vertical split = row direction in Mosaic
		});
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
