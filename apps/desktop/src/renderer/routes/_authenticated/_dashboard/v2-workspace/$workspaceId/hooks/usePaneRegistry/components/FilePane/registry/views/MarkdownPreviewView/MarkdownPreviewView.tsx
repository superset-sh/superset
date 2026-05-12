import { useRef } from "react";
import { TipTapMarkdownRenderer } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer";
import { MarkdownSearch } from "renderer/components/MarkdownSearch";
import { useMarkdownSearch } from "renderer/hooks/useMarkdownSearch";
import type { ViewProps } from "../../types";

export function MarkdownPreviewView({
	document,
	filePath,
	isFocused,
}: ViewProps) {
	const markdownContainerRef = useRef<HTMLDivElement>(null);
	const markdownSearch = useMarkdownSearch({
		containerRef: markdownContainerRef,
		isFocused,
		isRenderedMode: document.content.kind === "text",
		filePath,
	});

	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<div className="relative h-full">
			<MarkdownSearch
				isOpen={markdownSearch.isSearchOpen}
				query={markdownSearch.query}
				caseSensitive={markdownSearch.caseSensitive}
				matchCount={markdownSearch.matchCount}
				activeMatchIndex={markdownSearch.activeMatchIndex}
				onQueryChange={markdownSearch.setQuery}
				onCaseSensitiveChange={markdownSearch.setCaseSensitive}
				onFindNext={markdownSearch.findNext}
				onFindPrevious={markdownSearch.findPrevious}
				onClose={markdownSearch.closeSearch}
			/>
			<div ref={markdownContainerRef} className="h-full overflow-auto p-4">
				<TipTapMarkdownRenderer value={document.content.value} />
			</div>
		</div>
	);
}
