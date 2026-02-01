import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useState } from "react";
import {
	LuChevronsDownUp,
	LuEye,
	LuEyeOff,
	LuFilePlus,
	LuFolderPlus,
	LuRefreshCw,
} from "react-icons/lu";
import { SEARCH_DEBOUNCE_MS } from "../../constants";

interface FileTreeToolbarProps {
	searchTerm: string;
	onSearchChange: (term: string) => void;
	onNewFile: () => void;
	onNewFolder: () => void;
	onCollapseAll: () => void;
	onRefresh: () => void;
	showHiddenFiles: boolean;
	onToggleHiddenFiles: () => void;
	isRefreshing?: boolean;
}

export function FileTreeToolbar({
	searchTerm,
	onSearchChange,
	onNewFile,
	onNewFolder,
	onCollapseAll,
	onRefresh,
	showHiddenFiles,
	onToggleHiddenFiles,
	isRefreshing = false,
}: FileTreeToolbarProps) {
	const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

	const handleSearchChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setLocalSearchTerm(value);

			const timeoutId = setTimeout(() => {
				onSearchChange(value);
			}, SEARCH_DEBOUNCE_MS);

			return () => clearTimeout(timeoutId);
		},
		[onSearchChange],
	);

	return (
		<div className="flex flex-col gap-1 px-2 py-1.5 border-b border-border">
			<Input
				type="text"
				placeholder="Search files..."
				value={localSearchTerm}
				onChange={handleSearchChange}
				className="h-7 text-xs"
			/>

			<div className="flex items-center gap-0.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onNewFile}
						>
							<LuFilePlus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">New File</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onNewFolder}
						>
							<LuFolderPlus className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">New Folder</TooltipContent>
				</Tooltip>

				<div className="flex-1" />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onToggleHiddenFiles}
						>
							{showHiddenFiles ? (
								<LuEye className="size-3.5" />
							) : (
								<LuEyeOff className="size-3.5" />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{showHiddenFiles ? "Hide Hidden Files" : "Show Hidden Files"}
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onCollapseAll}
						>
							<LuChevronsDownUp className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">Collapse All</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-6"
							onClick={onRefresh}
							disabled={isRefreshing}
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
