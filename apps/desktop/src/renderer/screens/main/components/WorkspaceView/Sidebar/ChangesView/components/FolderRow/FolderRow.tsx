import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { CollapsibleRow } from "../CollapsibleRow";

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

function FolderRowHeader({
	name,
	level,
	fileCount,
	isGrouped,
}: {
	name: string;
	level: number;
	fileCount?: number;
	isGrouped: boolean;
}) {
	return (
		<>
			{!isGrouped && <LevelIndicators level={level} />}
			<div className="flex items-center gap-1 flex-1 min-w-0">
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
		</>
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
		<CollapsibleRow
			isExpanded={isExpanded}
			onToggle={onToggle}
			showChevron={!isGrouped}
			className={cn(isGrouped && "overflow-hidden")}
			triggerClassName={cn(
				"text-xs items-stretch py-0.5",
				isGrouped && "text-muted-foreground",
			)}
			contentClassName={cn(isGrouped && "ml-1.5 border-l border-border pl-0.5")}
			header={
				<FolderRowHeader
					name={name}
					level={level}
					fileCount={fileCount}
					isGrouped={isGrouped}
				/>
			}
		>
			{children}
		</CollapsibleRow>
	);
}
