import {
	SearchDialog,
	type SearchDialogItem,
} from "renderer/screens/main/components/SearchDialog";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import type { SearchScope } from "renderer/stores/search-dialog-state";
import { ScopeToggle } from "./components/ScopeToggle";

interface CommandPaletteResult extends SearchDialogItem {
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
	score: number;
	workspaceId?: string;
	workspaceName?: string;
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
	onSelectFile: (filePath: string, workspaceId?: string) => void;
	scope: SearchScope;
	onScopeChange: (scope: SearchScope) => void;
	workspaceName?: string;
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
	scope,
	onScopeChange,
	workspaceName,
}: CommandPaletteProps) {
	return (
		<SearchDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Quick Open"
			description={
				scope === "global"
					? "Search for files across all workspaces"
					: "Search for files in your workspace"
			}
			query={query}
			onQueryChange={onQueryChange}
			queryPlaceholder={
				scope === "global" ? "Search all workspaces..." : "Search files..."
			}
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
			onSelectItem={(file) => onSelectFile(file.path, file.workspaceId)}
			headerExtra={
				<ScopeToggle
					scope={scope}
					onScopeChange={onScopeChange}
					workspaceName={workspaceName}
				/>
			}
			renderItem={(file) => {
				return (
					<>
						<FileIcon fileName={file.name} className="size-3.5 shrink-0" />
						<span className="truncate font-medium">{file.name}</span>
						{scope === "global" && file.workspaceName && (
							<span className="shrink-0 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
								{file.workspaceName}
							</span>
						)}
						<span className="truncate text-muted-foreground text-xs ml-auto">
							{file.relativePath}
						</span>
					</>
				);
			}}
		/>
	);
}
