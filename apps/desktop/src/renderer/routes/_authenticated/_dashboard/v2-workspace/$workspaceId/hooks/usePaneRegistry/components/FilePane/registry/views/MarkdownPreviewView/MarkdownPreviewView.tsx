import { Trans } from "@lingui/react/macro";
import { useRef } from "react";
import { TipTapMarkdownRenderer } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer";
import { MarkdownSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/components/MarkdownSearch";
import { useMarkdownSearch } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/hooks/useMarkdownSearch";
import type { ViewProps } from "../../types";
import { splitFrontMatter } from "./splitFrontMatter";

// Beyond this size the per-keystroke merge in preserveSourceFormatting gets
// expensive; fall back to a read-only preview and leave editing to CodeView.
const MAX_EDITABLE_LENGTH = 1_500_000;

export function MarkdownPreviewView({
	document,
	filePath,
	isActive,
	showFrontMatterNote = true,
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

	const editable = document.content.value.length <= MAX_EDITABLE_LENGTH;
	// TipTap mangles YAML front matter (no node for it) — keep it out of the
	// editor and re-attach the verbatim block to every emission.
	const { frontMatter, body } = splitFrontMatter(document.content.value);

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
				{frontMatter !== "" && showFrontMatterNote && (
					<div className="mx-auto mb-2 max-w-3xl select-text text-xs text-muted-foreground">
						<Trans>
							Front matter hidden — switch to the Markdown view to edit it
						</Trans>
					</div>
				)}
				<TipTapMarkdownRenderer
					value={body}
					editable={editable}
					preserveSourceFormatting
					onChange={(next) => document.setContent(frontMatter + next)}
					onSave={() => void document.save()}
				/>
			</div>
		</div>
	);
}
