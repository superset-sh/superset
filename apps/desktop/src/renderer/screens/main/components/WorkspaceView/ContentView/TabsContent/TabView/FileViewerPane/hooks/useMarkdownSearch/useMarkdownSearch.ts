import type { RefObject } from "react";
import {
	type FindHotkeySearchController,
	useFindHotkeySearch,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";

interface UseMarkdownSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	isFocused: boolean;
	isRenderedMode: boolean;
	filePath: string;
}

export function useMarkdownSearch({
	containerRef,
	isFocused,
	isRenderedMode,
	filePath,
}: UseMarkdownSearchOptions): FindHotkeySearchController {
	return useFindHotkeySearch({
		containerRef,
		hotkeyId: "FIND_IN_FILE_VIEWER",
		highlightPrefix: "markdown-search",
		isActive: isFocused && isRenderedMode,
		resetKey: filePath,
	});
}
