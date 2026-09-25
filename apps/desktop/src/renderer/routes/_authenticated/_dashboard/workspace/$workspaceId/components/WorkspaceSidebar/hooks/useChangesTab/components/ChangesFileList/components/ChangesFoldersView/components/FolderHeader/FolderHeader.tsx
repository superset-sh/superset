import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

interface FolderHeaderProps {
	/** Display label — a folder path like "src/components", or "Root Path". */
	label: string;
	fileCount: number;
	isOpen: boolean;
	onToggle: () => void;
}

/**
 * Collapsible header for a folder group in the changes sidebar. Shows the
 * folder path right-truncated (so the deepest segment stays visible) and the
 * file count. The whole row toggles collapse — no chevron, matching v1's
 * "grouped" variant. The full path is surfaced via the shadcn `Tooltip` (the
 * native `title` attribute doesn't render reliably in our Electron renderer —
 * `FileRow` uses the same component for its hover hint).
 */
export function FolderHeader({
	label,
	fileCount,
	isOpen,
	onToggle,
}: FolderHeaderProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={isOpen}
					className="flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs text-muted-foreground hover:bg-accent/30"
				>
					{/* `dir="rtl"` right-truncates long paths so the deepest segment stays visible. */}
					<span className="min-w-0 flex-1 truncate" dir="rtl">
						{label}
					</span>
					<span className="ml-auto shrink-0 text-[11px] tabular-nums">
						{fileCount}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}
