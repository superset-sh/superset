import { useRef } from "react";
import { TipTapMarkdownRenderer } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer";
import { MarkdownSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/components/MarkdownSearch";
import { useMarkdownSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/hooks/useMarkdownSearch";
import type { ViewProps } from "../../types";

export function MarkdownPreviewView({
	document,
	filePath,
	isActive,
}: ViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const search = useMarkdownSearch({
		containerRef,
		isFocused: isActive,
		isRenderedMode: true,
		filePath,
	});

	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<div className="relative h-full">
			<MarkdownSearch
				isOpen={search.isSearchOpen}
				query={search.query}
				caseSensitive={search.caseSensitive}
				matchCount={search.matchCount}
				activeMatchIndex={search.activeMatchIndex}
				onQueryChange={search.setQuery}
				onCaseSensitiveChange={search.setCaseSensitive}
				onFindNext={search.findNext}
				onFindPrevious={search.findPrevious}
				onClose={search.closeSearch}
			/>
			<div ref={containerRef} className="h-full overflow-auto p-4">
				<TipTapMarkdownRenderer value={document.content.value} />
			</div>
		</div>
	);
}
