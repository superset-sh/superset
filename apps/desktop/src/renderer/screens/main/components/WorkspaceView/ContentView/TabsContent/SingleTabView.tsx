import type { SingleTab } from "renderer/stores";
import { TabContentContextMenu } from "./TabContentContextMenu";

interface SingleTabViewProps {
	tab: SingleTab;
	isDropZone: boolean;
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	const handleSplitHorizontal = () => {
		// TODO: Implement split horizontally functionality
		console.log("Split horizontally:", tab.id);
	};

	const handleSplitVertical = () => {
		// TODO: Implement split vertically functionality
		console.log("Split vertically:", tab.id);
	};

	const handleClosePane = () => {
		// TODO: Implement close pane functionality
		console.log("Close pane:", tab.id);
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
