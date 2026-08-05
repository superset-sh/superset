import type { WorkspaceStore } from "@superset/panes";
import type { ChatLaunchConfig } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../../../types";

export interface ChatPaneInterfaceProps {
	sessionId: string | null;
	initialLaunchConfig: ChatLaunchConfig | null;
	/**
	 * Called after the ChatPaneInterface successfully auto-submits the
	 * initial launch config so the owning pane can clear its persisted
	 * launchConfig and not re-trigger on re-render.
	 */
	onConsumeLaunchConfig?: () => void;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	getOrCreateSession: () => Promise<string>;
	onResetSession: () => Promise<void>;
	onUserMessageSubmitted?: (message: string) => void;
	paneId?: string | null;
	tabId?: string | null;
	store?: StoreApi<WorkspaceStore<PaneViewerData>> | null;
}
