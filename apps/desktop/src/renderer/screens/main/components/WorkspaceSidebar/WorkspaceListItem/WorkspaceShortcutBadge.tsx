import { cn } from "@superset/ui/utils";

interface WorkspaceShortcutBadgeProps {
	/** The formatted shortcut label to display (e.g., "⌘1", "Ctrl+Shift+1") */
	label: string;
	className?: string;
}

export function WorkspaceShortcutBadge({
	label,
	className,
}: WorkspaceShortcutBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center justify-center rounded px-1.5 h-5 text-xs font-mono tabular-nums text-muted-foreground bg-muted/50 shrink-0",
				className,
			)}
		>
			{label}
		</span>
	);
}
