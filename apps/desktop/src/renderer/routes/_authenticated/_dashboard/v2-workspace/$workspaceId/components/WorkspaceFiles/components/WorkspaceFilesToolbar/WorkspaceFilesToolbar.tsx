import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	LuChevronsDownUp,
	LuFilePlus,
	LuFolderPlus,
	LuRefreshCw,
	LuX,
} from "react-icons/lu";
import { SEARCH_DEBOUNCE_MS } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/constants";

interface WorkspaceFilesToolbarProps {
	searchTerm: string;
	onSearchChange: (term: string) => void;
	onNewFile: () => void;
	onNewFolder: () => void;
	onCollapseAll: () => void;
	onRefresh: () => void;
	isRefreshing?: boolean;
}

export function WorkspaceFilesToolbar({
	searchTerm,
	onSearchChange,
	onNewFile,
	onNewFolder,
	onCollapseAll,
	onRefresh,
	isRefreshing = false,
}: WorkspaceFilesToolbarProps) {
	const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);
	const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}
		setLocalSearchTerm(searchTerm);
	}, [searchTerm]);

	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	const handleSearchChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const nextValue = event.target.value;
			setLocalSearchTerm(nextValue);

			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			debounceTimeoutRef.current = setTimeout(() => {
				onSearchChange(nextValue);
				debounceTimeoutRef.current = null;
			}, SEARCH_DEBOUNCE_MS);
		},
		[onSearchChange],
	);

	const handleClearSearch = useCallback(() => {
		setLocalSearchTerm("");
		if (debounceTimeoutRef.current) {
			clearTimeout(debounceTimeoutRef.current);
			debounceTimeoutRef.current = null;
		}
		onSearchChange("");
	}, [onSearchChange]);

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 py-1.5">
			<div className="relative">
				<Input
					className="h-7 pr-7 text-xs"
					onChange={handleSearchChange}
					placeholder="Search files..."
					type="text"
					value={localSearchTerm}
				/>
				{localSearchTerm ? (
					<button
						className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						onClick={handleClearSearch}
						type="button"
					>
						<LuX className="size-3.5" />
					</button>
				) : null}
			</div>

			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="size-6"
							disabled
							onClick={onNewFile}
							size="icon"
							variant="ghost"
						>
							<LuFilePlus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">New File (coming soon)</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="size-6"
							disabled
							onClick={onNewFolder}
							size="icon"
							variant="ghost"
						>
							<LuFolderPlus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						New Folder (coming soon)
					</TooltipContent>
				</Tooltip>

				<div className="flex-1" />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="size-6"
							onClick={onCollapseAll}
							size="icon"
							variant="ghost"
						>
							<LuChevronsDownUp className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Collapse All</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							className="size-6"
							disabled={isRefreshing}
							onClick={onRefresh}
							size="icon"
							variant="ghost"
						>
							<LuRefreshCw
								className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Refresh</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
