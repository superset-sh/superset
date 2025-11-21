import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import type { Tab } from "renderer/stores";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";

interface GroupTabPaneProps {
	tabId: string;
	path: MosaicBranch[];
	childTab: Tab;
	isActive: boolean;
	workspaceId: string;
	groupId: string;
	splitTabHorizontal: (
		workspaceId: string,
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => void;
	splitTabVertical: (
		workspaceId: string,
		sourceTabId?: string,
		path?: MosaicBranch[],
	) => void;
	removeChildTabFromGroup: (groupId: string, tabId: string) => void;
	setActiveTab: (workspaceId: string, tabId: string) => void;
}

export function GroupTabPane({
	tabId,
	path,
	childTab,
	isActive,
	workspaceId,
	groupId,
	splitTabHorizontal,
	splitTabVertical,
	removeChildTabFromGroup,
	setActiveTab,
}: GroupTabPaneProps) {
	const handleFocus = () => {
		setActiveTab(workspaceId, tabId);
	};

	return (
		<MosaicWindow<string>
			path={path}
			title={childTab.title}
			toolbarControls={<div />}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitTabHorizontal(workspaceId, tabId, path)}
				onSplitVertical={() => splitTabVertical(workspaceId, tabId, path)}
				onClosePane={() => removeChildTabFromGroup(groupId, tabId)}
			>
				<div className="w-full h-full overflow-hidden">
					<Terminal />
				</div>
			</TabContentContextMenu>
		</MosaicWindow>
	);
}
