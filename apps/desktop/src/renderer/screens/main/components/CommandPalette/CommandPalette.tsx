import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { LuLayoutGrid } from "react-icons/lu";
import { SearchDialog } from "renderer/screens/main/components/SearchDialog";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import type { SearchScope } from "renderer/stores/search-dialog-state";
import { ScopeToggle } from "./components/ScopeToggle";
import type { CommandPaletteResult } from "./useCommandPalette";

/** A file match result in the command palette. */
interface FileResult {
	id: string;
	resultType: "file";
	name: string;
	relativePath: string;
	path: string;
	isDirectory: boolean;
	score: number;
	workspaceId?: string;
	workspaceName?: string;
}

/** A workspace match result in the command palette. */
interface WorkspaceResult {
	id: string;
	resultType: "workspace";
	name: string;
	projectName: string;
	type: "worktree" | "branch";
}

/** Props for the CommandPalette component. */
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
	onSelectResult: (result: CommandPaletteResult) => void;
	scope: SearchScope;
	onScopeChange: (scope: SearchScope) => void;
	workspaceName?: string;
}

/** Quick Open dialog that shows workspace and file search results in separate groups. */
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
	onSelectResult,
	scope,
	onScopeChange,
	workspaceName,
}: CommandPaletteProps) {
	const workspaceResults = searchResults.filter(
		(r): r is WorkspaceResult => r.resultType === "workspace",
	);
	const fileResults = searchResults.filter(
		(r): r is FileResult => r.resultType === "file",
	);
	const hasResults = searchResults.length > 0;

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
			isLoading={isLoading}
			headerExtra={
				<ScopeToggle
					scope={scope}
					onScopeChange={onScopeChange}
					workspaceName={workspaceName}
				/>
			}
		>
			{query.trim().length > 0 && !isLoading && !hasResults && (
				<CommandEmpty>No results found.</CommandEmpty>
			)}
			{workspaceResults.length > 0 && (
				<CommandGroup heading="Workspaces">
					{workspaceResults.map((ws) => (
						<CommandItem
							key={ws.id}
							value={`workspace:${ws.name} ${ws.projectName} ${query}`}
							onSelect={() => onSelectResult(ws)}
						>
							<LuLayoutGrid className="size-3.5 shrink-0" />
							<span className="truncate font-medium">
								{ws.name === "main" && ws.type === "worktree"
									? ws.projectName
									: ws.name}
							</span>
							<span className="shrink-0 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
								{ws.projectName}
							</span>
						</CommandItem>
					))}
				</CommandGroup>
			)}
			{fileResults.length > 0 && (
				<CommandGroup
					heading={workspaceResults.length > 0 ? "Files" : undefined}
				>
					{fileResults.map((file) => (
						<CommandItem
							key={file.id}
							value={`${file.path} ${query}`}
							onSelect={() => onSelectResult(file)}
						>
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
						</CommandItem>
					))}
				</CommandGroup>
			)}
		</SearchDialog>
	);
}
