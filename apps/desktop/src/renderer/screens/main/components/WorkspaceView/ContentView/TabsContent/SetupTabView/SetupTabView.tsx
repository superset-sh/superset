import {
	type SetupTab,
	useRemoveTab,
	useSplitTabHorizontal,
	useSplitTabVertical,
} from "renderer/stores";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { SetupTerminal } from "./SetupTerminal";

interface SetupTabViewProps {
	tab: SetupTab;
	isDropZone: boolean;
}

export function SetupTabView({ tab }: SetupTabViewProps) {
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
			<div className="w-full h-full overflow-hidden bg-background">
				<SetupTerminal
					tabId={tab.id}
					workspaceId={tab.workspaceId}
					setupCommands={tab.setupCommands}
					setupCopyResults={tab.setupCopyResults}
					setupCwd={tab.setupCwd}
				/>
			</div>
		</TabContentContextMenu>
	);
}
