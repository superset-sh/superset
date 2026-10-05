import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { OpenFile } from "../../../../../../types";

export type ChatPaneActions = {
	/** Absent where the chat has no workspace to open files into. */
	openFile?: OpenFile | undefined;
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
}: ChatPaneActions & { children: ReactNode }) {
	const value = useMemo<ChatPaneActions>(() => ({ openFile }), [openFile]);
	return (
		<ChatPaneActionsContext.Provider value={value}>
			{children}
		</ChatPaneActionsContext.Provider>
	);
}

export function useChatPaneActions(): ChatPaneActions {
	return useContext(ChatPaneActionsContext);
}
