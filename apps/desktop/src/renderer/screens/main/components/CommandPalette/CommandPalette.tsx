import {
	SearchDialog,
	type SearchDialogItem,
} from "renderer/screens/main/components/SearchDialog";
import { getFileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils/file-icons";

interface CommandPaletteResult extends SearchDialogItem {
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
	score: number;
}

interface CommandPaletteProps {
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
	searchResults: CommandPaletteResult[];
	onSelectFile: (filePath: string) => void;
}

export function CommandPalette({
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
	onSelectFile,
}: CommandPaletteProps) {
	return (
		<SearchDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Quick Open"
			description="Search for files in your workspace"
			query={query}
			onQueryChange={onQueryChange}
			queryPlaceholder="Search files..."
			filtersOpen={filtersOpen}
			onFiltersOpenChange={onFiltersOpenChange}
			includePattern={includePattern}
			onIncludePatternChange={onIncludePatternChange}
			excludePattern={excludePattern}
			onExcludePatternChange={onExcludePatternChange}
			emptyMessage="No files found."
			isLoading={isLoading}
			results={searchResults}
			getItemValue={(file) => `${file.path} ${query}`}
			onSelectItem={(file) => onSelectFile(file.relativePath)}
			renderItem={(file) => {
				const { icon: Icon, color } = getFileIcon(file.name, false);
				return (
					<>
						<Icon className={`size-3.5 shrink-0 ${color}`} />
						<span className="truncate font-medium">{file.name}</span>
						<span className="truncate text-muted-foreground text-xs ml-auto">
							{file.relativePath}
						</span>
					</>
				);
			}}
		/>
	);
}
