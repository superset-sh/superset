import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CommandPrimitive, CommandSeparator } from "@superset/ui/command";
import { SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { RecentFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";
import { RECENT_DISPLAY_LIMIT } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";
import { FileResultItem } from "./components/FileResultItem";
import { useV2FileSearch } from "./hooks/useV2FileSearch";

// 48px input + 10 * 40px items
const MAX_DIALOG_HEIGHT = 448;
const SEARCH_LIMIT = 50;

export interface CommandPaletteProps {
	workspaceId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectFile: (filePath: string) => void;
	variant?: "v1" | "v2";
	recentlyViewedFiles?: RecentFile[];
	openFilePaths?: Set<string>;
}

function getFileName(relativePath: string): string {
	const segments = relativePath.split("/");
	return segments[segments.length - 1] ?? relativePath;
}

export function CommandPalette({
	workspaceId,
	open,
	onOpenChange,
	onSelectFile,
	variant = "v1",
	recentlyViewedFiles,
	openFilePaths,
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [includePattern, setIncludePattern] = useState("");
	const [excludePattern, setExcludePattern] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const v1Search = useFileSearch({
		workspaceId: variant === "v1" && open ? workspaceId : undefined,
		searchTerm: variant === "v1" ? query : "",
		includePattern: variant === "v1" ? includePattern : "",
		excludePattern: variant === "v1" ? excludePattern : "",
		limit: SEARCH_LIMIT,
	});

	const v2Search = useV2FileSearch(
		variant === "v2" && open ? workspaceId : undefined,
		variant === "v2" ? query : "",
	);

	const rawResults =
		variant === "v2" ? v2Search.results : v1Search.searchResults;
	const trimmedQuery = query.trim();
	const hasQuery = trimmedQuery.length > 0;
	const showRecentSection = variant === "v2" && Boolean(recentlyViewedFiles);

	const orderedRecent = useMemo<RecentFile[]>(() => {
		if (!showRecentSection || !recentlyViewedFiles) return [];
		const openSet = openFilePaths ?? new Set<string>();
		const openFiles: RecentFile[] = [];
		const rest: RecentFile[] = [];
		for (const file of recentlyViewedFiles) {
			if (openSet.has(file.absolutePath)) {
				openFiles.push(file);
			} else {
				rest.push(file);
			}
		}
		return [...openFiles, ...rest].slice(0, RECENT_DISPLAY_LIMIT);
	}, [showRecentSection, recentlyViewedFiles, openFilePaths]);

	const filteredRecent = useMemo<RecentFile[]>(() => {
		if (!showRecentSection) return [];
		if (!hasQuery) return orderedRecent;
		const needle = trimmedQuery.toLowerCase();
		return orderedRecent.filter((file) =>
			file.relativePath.toLowerCase().includes(needle),
		);
	}, [showRecentSection, hasQuery, trimmedQuery, orderedRecent]);

	const recentAbsSet = useMemo(
		() => new Set(filteredRecent.map((f) => f.absolutePath)),
		[filteredRecent],
	);

	const dedupedResults = useMemo(() => {
		if (!showRecentSection) return rawResults;
		return rawResults.filter((r) => !recentAbsSet.has(r.path));
	}, [showRecentSection, rawResults, recentAbsSet]);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			onOpenChange(nextOpen);
			if (!nextOpen) setQuery("");
		},
		[onOpenChange],
	);

	const handleSelectFile = useCallback(
		(filePath: string) => {
			onSelectFile(filePath);
			handleOpenChange(false);
		},
		[onSelectFile, handleOpenChange],
	);

	useEffect(() => {
		if (open) requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);

	const showHeading = showRecentSection && filteredRecent.length > 0;
	const showSeparator =
		showRecentSection && filteredRecent.length > 0 && dedupedResults.length > 0;
	const showEmptyState =
		filteredRecent.length === 0 && dedupedResults.length === 0;

	return (
		<DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50" />
				<DialogPrimitive.Content
					className="fixed left-[50%] z-50 w-full max-w-[672px] translate-x-[-50%] overflow-hidden rounded-lg border shadow-lg"
					style={{ top: `calc(50% - ${MAX_DIALOG_HEIGHT / 2}px)` }}
				>
					<DialogPrimitive.Title className="sr-only">
						Quick Open
					</DialogPrimitive.Title>
					<DialogPrimitive.Description className="sr-only">
						Search for files in your workspace
					</DialogPrimitive.Description>

					<CommandPrimitive
						shouldFilter={false}
						className="bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md"
					>
						<div className="flex h-12 items-center gap-2 border-b px-3">
							<SearchIcon className="size-5 shrink-0 opacity-50" />
							<CommandPrimitive.Input
								ref={inputRef}
								placeholder="Search files..."
								value={query}
								onValueChange={setQuery}
								className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							/>
							{variant === "v1" && (
								<button
									type="button"
									className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
									onClick={() => setFiltersOpen((v) => !v)}
									aria-label={filtersOpen ? "Hide Filters" : "Show Filters"}
								>
									{filtersOpen ? (
										<LuChevronDown className="size-4" />
									) : (
										<LuChevronRight className="size-4" />
									)}
								</button>
							)}
						</div>

						{variant === "v1" && filtersOpen && (
							<div className="grid grid-cols-2 gap-2 border-b px-3 py-2">
								<input
									value={includePattern}
									onChange={(e) => setIncludePattern(e.target.value)}
									placeholder="files to include (glob)"
									className="h-8 rounded border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
								/>
								<input
									value={excludePattern}
									onChange={(e) => setExcludePattern(e.target.value)}
									placeholder="files to exclude (glob)"
									className="h-8 rounded border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
								/>
							</div>
						)}

						<CommandPrimitive.List className="max-h-[400px] overflow-x-hidden overflow-y-auto scroll-py-1 p-1">
							{showEmptyState && (
								<CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
									No files found.
								</CommandPrimitive.Empty>
							)}

							{showHeading && (
								<div className="px-2 pt-2 pb-1 text-muted-foreground text-xs">
									Recently Viewed
								</div>
							)}

							{filteredRecent.map((file) => (
								<FileResultItem
									key={`recent:${file.absolutePath}`}
									value={`recent:${file.absolutePath}`}
									fileName={getFileName(file.relativePath)}
									relativePath={file.relativePath}
									onSelect={() => handleSelectFile(file.absolutePath)}
								/>
							))}

							{showSeparator && (
								<CommandSeparator alwaysRender className="my-1" />
							)}

							{dedupedResults.map((file) => (
								<FileResultItem
									key={file.id}
									value={file.path}
									fileName={file.name}
									relativePath={file.relativePath}
									onSelect={() => handleSelectFile(file.path)}
								/>
							))}
						</CommandPrimitive.List>
					</CommandPrimitive>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
