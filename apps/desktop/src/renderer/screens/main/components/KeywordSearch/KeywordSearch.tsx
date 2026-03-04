import type { ReactNode } from "react";
import {
	SearchDialog,
	type SearchDialogItem,
} from "renderer/screens/main/components/SearchDialog";
import { getFileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils/file-icons";

interface KeywordSearchResult extends SearchDialogItem {
	name: string;
	relativePath: string;
	path: string;
	line: number;
	column: number;
	preview: string;
}

interface KeywordSearchProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	query: string;
	onQueryChange: (query: string) => void;
	filtersOpen: boolean;
	onFiltersOpenChange: (open: boolean) => void;
	includePattern: string;
	onIncludePatternChange: (value: string) => void;
	excludePattern: string;
	onExcludePatternChange: (value: string) => void;
	isLoading: boolean;
	searchResults: KeywordSearchResult[];
	onSelectMatch: (match: KeywordSearchResult) => void;
}

function renderHighlightedText(text: string, query: string): ReactNode {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return text;
	}

	const lowerText = text.toLowerCase();
	const lowerNeedle = trimmedQuery.toLowerCase();
	const nodes: ReactNode[] = [];
	let searchIndex = 0;

	while (searchIndex < text.length) {
		const matchIndex = lowerText.indexOf(lowerNeedle, searchIndex);
		if (matchIndex === -1) {
			break;
		}

		if (matchIndex > searchIndex) {
			nodes.push(
				<span key={`text-${searchIndex}`}>
					{text.slice(searchIndex, matchIndex)}
				</span>,
			);
		}

		nodes.push(
			<mark
				key={`mark-${matchIndex}`}
				className="rounded bg-[var(--highlight-match)] px-0.5 text-foreground"
			>
				{text.slice(matchIndex, matchIndex + trimmedQuery.length)}
			</mark>,
		);

		searchIndex = matchIndex + trimmedQuery.length;
	}

	if (nodes.length === 0) {
		return text;
	}

	if (searchIndex < text.length) {
		nodes.push(
			<span key={`text-${searchIndex}`}>{text.slice(searchIndex)}</span>,
		);
	}

	return nodes;
}

export function KeywordSearch({
	open,
	onOpenChange,
	query,
	onQueryChange,
	filtersOpen,
	onFiltersOpenChange,
	includePattern,
	onIncludePatternChange,
	excludePattern,
	onExcludePatternChange,
	isLoading,
	searchResults,
	onSelectMatch,
}: KeywordSearchProps) {
	return (
		<SearchDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Keyword Search"
			description="Search for keyword matches across files in your workspace"
			query={query}
			onQueryChange={onQueryChange}
			queryPlaceholder="Search keywords in files..."
			filtersOpen={filtersOpen}
			onFiltersOpenChange={onFiltersOpenChange}
			includePattern={includePattern}
			onIncludePatternChange={onIncludePatternChange}
			excludePattern={excludePattern}
			onExcludePatternChange={onExcludePatternChange}
			emptyMessage="No keyword matches found."
			isLoading={isLoading}
			results={searchResults}
			getItemValue={(match) => `${match.id} ${query}`}
			onSelectItem={onSelectMatch}
			renderItem={(match) => {
				const { icon: Icon, color } = getFileIcon(match.name, false);
				return (
					<>
						<Icon className={`size-3.5 shrink-0 ${color}`} />
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 min-w-0">
								<span className="truncate font-medium">
									{renderHighlightedText(match.name, query)}
								</span>
								<span className="truncate text-muted-foreground text-xs">
									{renderHighlightedText(match.relativePath, query)}:
									{match.line}
								</span>
							</div>
							{match.preview ? (
								<div className="truncate text-muted-foreground text-xs">
									{renderHighlightedText(match.preview, query)}
								</div>
							) : null}
						</div>
					</>
				);
			}}
		/>
	);
}
