import type { RefObject } from "react";
import { getDiffSearchRoots } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/utils/diffRendererRoots";
import {
	type FindHotkeySearchController,
	useFindHotkeySearch,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";

interface UseDiffPaneSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	/** Whether the diff pane is the active pane (drives hotkey + auto-close). */
	isActive: boolean;
}

/**
 * Cmd+F text search for the v2 changes (diff) pane. Searches the rendered diff
 * content across each file's `@pierre/diffs` shadow root. Because the underlying
 * CodeView is virtualized, matches are scoped to currently rendered/expanded
 * lines.
 */
export function useDiffPaneSearch({
	containerRef,
	isActive,
}: UseDiffPaneSearchOptions): FindHotkeySearchController {
	return useFindHotkeySearch({
		containerRef,
		hotkeyId: "FIND_IN_DIFF",
		highlightPrefix: "diff-pane-search",
		isActive,
		getSearchRoots: getDiffSearchRoots,
	});
}
