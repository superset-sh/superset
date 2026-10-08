import { useLingui } from "@lingui/react/macro";
import {
	type ContextMenuActionConfig,
	type PaneActionConfig,
	type PaneRegistry,
	type Tab,
	Workspace,
	type WorkspaceInteractionState,
	type WorkspaceStore,
} from "@superset/panes";
import type { ReactNode } from "react";
import { LuArrowLeftToLine, LuMaximize2, LuMinimize2 } from "react-icons/lu";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import type { StoreApi } from "zustand/vanilla";
import { renderBrowserTabIcon } from "../../hooks/usePaneRegistry/components/BrowserPane";
import type { PaneViewerData } from "../../types";
import { V2NotificationStatusIndicator } from "../V2NotificationStatusIndicator";
import { RightPaneAddMenu } from "./components/RightPaneAddMenu";
import { RightPaneEmptyState } from "./components/RightPaneEmptyState";
import { RightPaneHeaderButton } from "./components/RightPaneHeaderButton";
import type { RightPaneKind } from "./types";

interface RightPaneAreaProps {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	registry: PaneRegistry<PaneViewerData>;
	paneActions: PaneActionConfig<PaneViewerData>[];
	contextMenuActions: ContextMenuActionConfig<PaneViewerData>[];
	onBeforeCloseTab: (tab: Tab<PaneViewerData>) => boolean | Promise<boolean>;
	onInteractionStateChange?: (state: WorkspaceInteractionState) => void;
	workspaceControls: ReactNode;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	onToggleSidebar: () => void;
	onActivate: () => void;
	onMergeIntoCenter: () => void;
	onAdd: (kind: RightPaneKind) => void;
	showWindowControls: boolean;
}

export function RightPaneArea({
	store,
	registry,
	paneActions,
	contextMenuActions,
	onBeforeCloseTab,
	onInteractionStateChange,
	workspaceControls,
	isExpanded,
	onToggleExpanded,
	onToggleSidebar,
	onActivate,
	onMergeIntoCenter,
	onAdd,
	showWindowControls,
}: RightPaneAreaProps) {
	const { t } = useLingui();

	return (
		<div
			className="contents"
			data-pane-area="right"
			onPointerDownCapture={onActivate}
			onFocusCapture={onActivate}
		>
			<Workspace<PaneViewerData>
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
				onPaneError={reportRendererError}
				renderTabIcon={renderBrowserTabIcon}
				renderTabAccessory={(tab) => (
					<V2NotificationStatusIndicator
						sources={getV2NotificationSourcesForTab(tab)}
					/>
				)}
				renderAddTabMenu={() => <RightPaneAddMenu onAdd={onAdd} />}
				renderTabBarTrailing={() => (
					<div className="flex items-center gap-1 pr-1">
						<RightPaneHeaderButton
							label={t({ message: "Merge into center" })}
							onClick={onMergeIntoCenter}
						>
							<LuArrowLeftToLine className="size-4" strokeWidth={1.5} />
						</RightPaneHeaderButton>
						<RightPaneHeaderButton
							label={
								isExpanded
									? t({ message: "Restore width" })
									: t({ message: "Expand" })
							}
							onClick={onToggleExpanded}
						>
							{isExpanded ? (
								<LuMinimize2 className="size-4" strokeWidth={1.5} />
							) : (
								<LuMaximize2 className="size-4" strokeWidth={1.5} />
							)}
						</RightPaneHeaderButton>
						{workspaceControls}
						<RightSidebarToggle compact isOpen onToggle={onToggleSidebar} />
						{showWindowControls && <WindowControlsInset />}
					</div>
				)}
				renderEmptyState={() => <RightPaneEmptyState onAdd={onAdd} />}
				onBeforeCloseTab={onBeforeCloseTab}
				onInteractionStateChange={onInteractionStateChange}
				store={store}
			/>
		</div>
	);
}
