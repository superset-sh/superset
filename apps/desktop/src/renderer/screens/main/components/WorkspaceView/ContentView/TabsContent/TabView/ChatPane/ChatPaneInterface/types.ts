import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import type { ChatLaunchConfig } from "shared/tabs-types";

export interface ChatPaneInterfaceProps {
	paneId: string;
	sessionId: string | null;
	initialLaunchConfig: ChatLaunchConfig | null;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	isSessionReady: boolean;
	ensureSessionReady: () => Promise<boolean>;
	onStartFreshSession: () => Promise<StartFreshSessionResult>;
	onConsumeLaunchConfig: () => void;
	onUserMessageSubmitted?: (message: string) => void;
}
