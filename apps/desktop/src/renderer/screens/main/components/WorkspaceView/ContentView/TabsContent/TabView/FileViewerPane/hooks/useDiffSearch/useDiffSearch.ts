import type { RefObject } from "react";
import {
	type FindHotkeySearchController,
	useFindHotkeySearch,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/hooks";
import { getDiffSearchRoots } from "../../utils/diffRendererRoots";

interface UseDiffSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	isFocused: boolean;
	isDiffMode: boolean;
	filePath: string;
}

export function useDiffSearch({
	containerRef,
	isFocused,
	isDiffMode,
	filePath,
}: UseDiffSearchOptions): FindHotkeySearchController {
	return useFindHotkeySearch({
		containerRef,
		hotkeyId: "FIND_IN_FILE_VIEWER",
		highlightPrefix: "diff-search",
		isActive: isFocused && isDiffMode,
		getSearchRoots: getDiffSearchRoots,
		resetKey: filePath,
	});
}
