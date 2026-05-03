import type { AutomationPromptSource } from "@superset/db/schema";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { format, isSameYear } from "date-fns";

interface VersionRowProps {
	authorName: string | null;
	source: AutomationPromptSource;
	updatedAt: Date;
	selected: boolean;
	onSelect: () => void;
}

export function VersionRow({
	authorName,
	source,
	updatedAt,
	selected,
	onSelect,
}: VersionRowProps) {
	const formatted = format(
		updatedAt,
		isSameYear(updatedAt, new Date())
			? "MMMM d · h:mm a"
			: "MMMM d, yyyy · h:mm a",
	);

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"flex w-full flex-col items-start gap-px px-3 py-1.5 text-left transition-colors hover:bg-accent",
				selected && "bg-accent",
			)}
		>
			<div className="flex w-full items-center gap-1.5">
				<span className="truncate text-sm font-medium leading-tight">
					{formatted}
				</span>
				{source === "agent" && (
					<Badge variant="secondary" className="px-1 py-0 text-[10px]">
						Agent
					</Badge>
				)}
				{source === "restore" && (
					<Badge variant="outline" className="px-1 py-0 text-[10px]">
						Restored
					</Badge>
				)}
			</div>
			<span className="truncate text-xs leading-tight text-muted-foreground">
				{authorName ?? "Unknown"}
			</span>
		</button>
	);
}
