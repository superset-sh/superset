import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";

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
				<div key={i} className="w-3 self-stretch border-r border-border/50" />
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
					"text-xs w-full flex items-stretch gap-1 px-1.5 hover:bg-accent/50 cursor-pointer rounded-sm text-left overflow-hidden transition-colors",
					isGrouped && "text-muted-foreground",
				)}
			>
				{!isGrouped && <LevelIndicators level={level} />}
				<div className="flex items-center gap-1 flex-1 min-w-0 py-0.5">
					{!isGrouped && (
						<HiChevronRight
							className={cn(
								"size-2.5 text-muted-foreground shrink-0 transition-transform duration-150",
								isExpanded && "rotate-90",
							)}
						/>
					)}
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
						<span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
							{fileCount}
						</span>
					)}
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent
				className={cn(
					"min-w-0",
					isGrouped && "ml-1.5 border-l border-border pl-0.5",
				)}
			>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
