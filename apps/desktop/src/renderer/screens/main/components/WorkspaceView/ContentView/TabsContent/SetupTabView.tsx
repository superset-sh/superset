import {
	type SetupTab,
	useRemoveTab,
	useSetActiveTab,
	useSplitTabHorizontal,
	useSplitTabVertical,
} from "renderer/stores";
import { TabContentContextMenu } from "./TabContentContextMenu";
import { SetupTerminal } from "./Terminal";

interface SetupTabViewProps {
	tab: SetupTab;
	isDropZone: boolean;
}

export function SetupTabView({ tab }: SetupTabViewProps) {
	const splitTabHorizontal = useSplitTabHorizontal();
	const splitTabVertical = useSplitTabVertical();
	const removeTab = useRemoveTab();
	const setActiveTab = useSetActiveTab();

	const handleSplitHorizontal = () => {
		splitTabHorizontal(tab.workspaceId, tab.id);
	};

	const handleSplitVertical = () => {
		splitTabVertical(tab.workspaceId, tab.id);
	};

	const handleClosePane = () => {
		removeTab(tab.id);
	};

	const handleFocus = () => {
		setActiveTab(tab.workspaceId, tab.id);
	};

	return (
		<TabContentContextMenu
			onSplitHorizontal={handleSplitHorizontal}
			onSplitVertical={handleSplitVertical}
			onClosePane={handleClosePane}
		>
			<div className="w-full h-full overflow-hidden bg-background">
				<SetupTerminal tabId={tab.id} workspaceId={tab.workspaceId} />
			</div>
		</TabContentContextMenu>
	);
}
