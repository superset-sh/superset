import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CommandPrimitive } from "@superset/ui/command";
import { SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
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
}

export function CommandPalette({
	workspaceId,
	open,
	onOpenChange,
	onSelectFile,
	variant = "v1",
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

	const results = variant === "v2" ? v2Search.results : v1Search.searchResults;

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
							{results.length === 0 && (
								<CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
									No files found.
								</CommandPrimitive.Empty>
							)}
							{results.map((file) => (
								<CommandPrimitive.Item
									key={file.id}
									value={file.path}
									onSelect={() => handleSelectFile(file.path)}
									className="group data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
								>
									<FileIcon
										fileName={file.name}
										className="size-3.5 shrink-0"
									/>
									<span className="max-w-[252px] truncate font-medium">
										{file.name}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{file.relativePath}
									</span>
									<kbd className="ml-auto hidden shrink-0 text-xs text-muted-foreground group-data-[selected=true]:block">
										↵
									</kbd>
								</CommandPrimitive.Item>
							))}
						</CommandPrimitive.List>
					</CommandPrimitive>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
