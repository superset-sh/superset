import type { TerminalPreset } from "@superset/local-db";
import type {
	AgentLaunchRequest,
	AgentLaunchResult,
	AgentLaunchSource,
} from "@superset/shared/agent-launch";
import type { ChatLaunchConfig } from "shared/tabs-types";

export interface AgentLaunchPane {
	id: string;
	tabId: string;
	type: string;
	chat?: {
		sessionId: string | null;
		launchConfig?: ChatLaunchConfig | null;
	};
}

export interface AgentLaunchTab {
	id: string;
	workspaceId: string;
}

export interface AgentLaunchTabsAdapter {
	getPane: (paneId: string) => AgentLaunchPane | undefined;
	getTab: (tabId: string) => AgentLaunchTab | undefined;
	addTerminalTab: (workspaceId: string) => { tabId: string; paneId: string };
	addTerminalPane: (tabId: string) => string;
	removePane: (paneId: string) => void;
	setTabAutoTitle: (tabId: string, title: string) => void;
	addChatTab: (
		workspaceId: string,
		options?: { launchConfig?: ChatLaunchConfig | null },
	) => { tabId: string; paneId: string };
	addChatPane: (
		tabId: string,
		options?: { launchConfig?: ChatLaunchConfig | null },
	) => string;
	switchChatSession: (paneId: string, sessionId: string | null) => void;
	setChatLaunchConfig: (
		paneId: string,
		launchConfig: ChatLaunchConfig | null,
	) => void;
}

export interface AgentSessionLaunchContext {
	source?: AgentLaunchSource;
	tabs?: AgentLaunchTabsAdapter;
	createOrAttach: (input: {
		paneId: string;
		tabId: string;
		workspaceId: string;
		cwd?: string;
		joinPending?: boolean;
	}) => Promise<unknown>;
	write: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
	sendChatMessage?: (input: {
		sessionId: string;
		prompt: string;
		model?: string;
	}) => Promise<void>;
	captureEvent?: (input: {
		event: "agent_session_launch";
		properties: Record<string, unknown>;
	}) => void;
}

export interface QueueAgentSessionLaunchInput {
	request: AgentLaunchRequest | unknown;
	projectId?: string;
	initialCommands?: string[] | null;
	defaultPresets?: TerminalPreset[];
}

export type AgentSessionLaunchAdapterKind = "terminal" | "chat";

export type LaunchResultPayload = Pick<
	AgentLaunchResult,
	"tabId" | "paneId" | "sessionId"
>;
