import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";

interface FolderRowProps {
	name: string;
	isExpanded: boolean;
	onToggle: (expanded: boolean) => void;
	children: ReactNode;
	/** Number of level indentations (for tree view) */
	level?: number;
	/** Show file count badge */
	fileCount?: number;
	/** Use compact styling (grouped view) or full styling (tree view) */
	variant?: "tree" | "grouped";
}

function LevelIndicators({ level }: { level: number }) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={i} className="w-3 self-stretch border-r border-border" />
			))}
		</div>
	);
}

export function FolderRow({
	name,
	isExpanded,
	onToggle,
	children,
	level = 0,
	fileCount,
	variant = "tree",
}: FolderRowProps) {
	const isGrouped = variant === "grouped";

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn("min-w-0", isGrouped && "overflow-hidden")}
		>
			<CollapsibleTrigger
				className={cn(
					"text-xs w-full flex items-stretch gap-1.5 px-2 hover:bg-accent/50 cursor-pointer rounded-sm text-left overflow-hidden",
					isGrouped && "text-muted-foreground",
				)}
			>
				{!isGrouped && <LevelIndicators level={level} />}
				<div className="flex items-center gap-1.5 flex-1 min-w-0 py-1">
					{!isGrouped &&
						(isExpanded ? (
							<HiChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
						) : (
							<HiChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
						))}
					<span
						className={cn(
							"truncate",
							isGrouped
								? "w-0 grow text-left"
								: "flex-1 min-w-0 text-xs text-foreground",
						)}
						dir={isGrouped ? "rtl" : undefined}
					>
						{name}
					</span>
					{fileCount !== undefined && (
						<span className="text-xs opacity-60 shrink-0">{fileCount}</span>
					)}
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent
				className={cn(
					"min-w-0",
					isGrouped && "ml-2 border-l border-border pl-1",
				)}
			>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
