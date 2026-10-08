import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { ModifierEvent } from "renderer/lib/clickPolicy";
import type { OpenFile } from "../../../../../../types";

export type OpenPage = (url: string, event: ModifierEvent) => void;

export type OpenLink = (
	href: string,
	event: ModifierEvent & { clientX: number; clientY: number },
) => boolean;

export type ChatPaneActions = {
	/** Absent where the chat has no workspace to open files into. */
	openFile?: OpenFile | undefined;
	workspaceId?: string | undefined;
	/** Absent where the chat has no workspace to open pages into. */
	openPage?: OpenPage | undefined;
	openLink?: OpenLink | undefined;
};

const ChatPaneActionsContext = createContext<ChatPaneActions>({});

/**
 * What a transcript row can ask the pane around it to do. A diff header opens
 * its file from six components down; threading a prop that far would make
 * every row in between carry it.
 */
export function ChatPaneActionsProvider({
	children,
	openFile,
	workspaceId,
	openPage,
	openLink,
}: ChatPaneActions & { children: ReactNode }) {
	const value = useMemo<ChatPaneActions>(
		() => ({ openFile, workspaceId, openPage, openLink }),
		[openFile, workspaceId, openPage, openLink],
	);
	return (
		<ChatPaneActionsContext.Provider value={value}>
			{children}
		</ChatPaneActionsContext.Provider>
	);
}

export function useChatPaneActions(): ChatPaneActions {
	return useContext(ChatPaneActionsContext);
}
