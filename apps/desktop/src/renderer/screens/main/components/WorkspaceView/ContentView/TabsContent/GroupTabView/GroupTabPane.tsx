import type { MosaicBranch } from "react-mosaic-component";
import { MosaicWindow } from "react-mosaic-component";
import { HiMiniXMark } from "react-icons/hi2";
import type { Tab } from "main/lib/trpc/routers/tabs";
import { useSetActiveTab } from "renderer/react-query/tabs";
import { TabContentContextMenu } from "../TabContentContextMenu";
import { Terminal } from "../Terminal";
import { Button } from "@superset/ui/button";

interface GroupTabPaneProps {
	path: MosaicBranch[];
	childTab: Tab & { type: "terminal" };
	isActive: boolean;
	groupId: string;
	splitTabHorizontal: (sourceTabId?: string, path?: MosaicBranch[]) => void;
	splitTabVertical: (sourceTabId?: string, path?: MosaicBranch[]) => void;
	removeChildTabFromGroup: (groupId: string, tabId: string) => void;
}

export function GroupTabPane({
	path,
	childTab,
	isActive,
	groupId,
	splitTabHorizontal,
	splitTabVertical,
	removeChildTabFromGroup,
}: GroupTabPaneProps) {
	const setActiveTabMutation = useSetActiveTab();

	const handleFocus = () => {
		setActiveTabMutation.mutate({ tabId: childTab.id });
	};

	const handleCloseTab = (e: React.MouseEvent) => {
		e.stopPropagation();
		removeChildTabFromGroup(groupId, childTab.id);
	};

	return (
		<MosaicWindow<string>
			path={path}
			title={childTab.title}
			toolbarControls={
				<Button
					variant="link"
					size="icon"
					onClick={handleCloseTab}
					title="Close pane"
					className=" hover:text-white/80"
				>
					<HiMiniXMark className="size-4" />
				</Button>
			}
			className={isActive ? "mosaic-window-focused" : ""}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitTabHorizontal(childTab.id, path)}
				onSplitVertical={() => splitTabVertical(childTab.id, path)}
				onClosePane={() => removeChildTabFromGroup(groupId, childTab.id)}
			>
				<div className="w-full h-full overflow-hidden">
					<Terminal tab={childTab} />
				</div>
			</TabContentContextMenu>
		</MosaicWindow>
	);
}
