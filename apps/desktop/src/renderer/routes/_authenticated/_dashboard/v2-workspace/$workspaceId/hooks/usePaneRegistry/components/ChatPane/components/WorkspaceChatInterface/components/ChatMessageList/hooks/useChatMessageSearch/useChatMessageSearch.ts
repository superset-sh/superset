import type { RefObject } from "react";
import {
	type FindHotkeySearchController,
	useFindHotkeySearch,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";

interface UseChatMessageSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	isFocused: boolean;
}

export function useChatMessageSearch({
	containerRef,
	isFocused,
}: UseChatMessageSearchOptions): FindHotkeySearchController {
	return useFindHotkeySearch({
		containerRef,
		hotkeyId: "FIND_IN_CHAT",
		highlightPrefix: "chat-search",
		isActive: isFocused,
	});
}
