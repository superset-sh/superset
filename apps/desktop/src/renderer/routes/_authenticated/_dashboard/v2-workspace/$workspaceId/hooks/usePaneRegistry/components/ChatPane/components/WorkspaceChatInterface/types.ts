import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/hooks/useWorkspaceChatDisplay";
import type { ChatLaunchConfig } from "shared/tabs-types";

export interface ChatRawSnapshot {
	sessionId: string | null;
	isRunning: boolean;
	currentMessage: UseChatDisplayReturn["currentMessage"] | null;
	messages: UseChatDisplayReturn["messages"];
	error: unknown;
}

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
	onRawSnapshotChange?: (snapshot: ChatRawSnapshot) => void;
}
