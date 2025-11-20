import {
	type SingleTab,
	useRemoveTab,
	useSplitTabHorizontal,
	useSplitTabVertical,
} from "renderer/stores";
import { TabContentContextMenu } from "./TabContentContextMenu";

interface SingleTabViewProps {
	tab: SingleTab;
	isDropZone: boolean;
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	const splitTabHorizontal = useSplitTabHorizontal();
	const splitTabVertical = useSplitTabVertical();
	const removeTab = useRemoveTab();

	const handleSplitHorizontal = () => {
		splitTabHorizontal(tab.workspaceId, tab.id);
	};

	const handleSplitVertical = () => {
		splitTabVertical(tab.workspaceId, tab.id);
	};

	const handleClosePane = () => {
		removeTab(tab.id);
	};

	return (
		<TabContentContextMenu
			onSplitHorizontal={handleSplitHorizontal}
			onSplitVertical={handleSplitVertical}
			onClosePane={handleClosePane}
		>
			<div className="flex-1 h-full overflow-auto bg-background">
				<div className="h-full w-full p-6">
					<h2 className="text-2xl font-semibold text-foreground">
						{tab.title}
					</h2>
				</div>
			</div>
		</TabContentContextMenu>
	);
}
