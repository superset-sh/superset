import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import type { FolderGroup, GitFile } from "./types";
import { getStatusColor, getStatusIndicator } from "./utils";

interface GroupedViewProps {
	groups: FolderGroup[];
	onFileSelect?: (file: GitFile) => void;
}

interface FolderGroupItemProps {
	group: FolderGroup;
	onFileSelect?: (file: GitFile) => void;
}

function FolderGroupItem({ group, onFileSelect }: FolderGroupItemProps) {
	const [isExpanded, setIsExpanded] = useState(true);

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={setIsExpanded}
			className="mb-2"
		>
			<CollapsibleTrigger
				className={cn(
					"w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-accent/50 cursor-pointer rounded-sm",
					"font-medium text-sm text-foreground text-left",
				)}
			>
				{isExpanded ? (
					<HiChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
				) : (
					<HiChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
				)}
				<span className="flex-1 truncate">{group.folderName}</span>
				<span className="text-xs text-muted-foreground">
					{group.files.length}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="ml-6 mt-1">
				{group.files.map((file) => {
					const statusColor = getStatusColor(file.status);
					const statusIndicator = getStatusIndicator(file.status);

					return (
						<button
							type="button"
							key={file.id}
							className="w-full flex items-center gap-2 px-2 py-1 hover:bg-accent/70 cursor-pointer rounded-sm group text-left"
							onClick={() => onFileSelect?.(file)}
						>
							<span className="text-sm text-foreground flex-1 truncate">
								{file.name}
							</span>
							{statusIndicator && (
								<span className={`text-xs font-medium ${statusColor}`}>
									{statusIndicator}
								</span>
							)}
							{file.staged && (
								<span className="text-xs text-green-500 opacity-0 group-hover:opacity-100">
									●
								</span>
							)}
							{file.oldPath && (
								<span className="text-xs text-muted-foreground truncate max-w-[100px]">
									→ {file.oldPath.split("/").pop()}
								</span>
							)}
						</button>
					);
				})}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function GroupedView({ groups, onFileSelect }: GroupedViewProps) {
	return (
		<div className="flex flex-col h-full overflow-auto">
			{groups.length === 0 ? (
				<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
					No files to display
				</div>
			) : (
				groups.map((group) => (
					<FolderGroupItem
						key={group.folderPath}
						group={group}
						onFileSelect={onFileSelect}
					/>
				))
			)}
		</div>
	);
}
