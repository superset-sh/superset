import type { AutomationPromptSource } from "@superset/db/schema";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { formatDistanceToNow } from "date-fns";

interface VersionRowProps {
	authorName: string | null;
	authorImage: string | null;
	source: AutomationPromptSource;
	updatedAt: Date;
	selected: boolean;
	onSelect: () => void;
}

export function VersionRow({
	authorName,
	authorImage,
	source,
	updatedAt,
	selected,
	onSelect,
}: VersionRowProps) {
	const absolute = updatedAt.toLocaleString();
	const relative = formatDistanceToNow(updatedAt, { addSuffix: true });

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
				selected && "bg-accent",
			)}
		>
			<Avatar size="sm" fullName={authorName} image={authorImage} />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-2">
					<span
						className="truncate text-sm font-medium"
						title={updatedAt.toString()}
					>
						{relative}
					</span>
					{source === "agent" && (
						<Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
							Agent
						</Badge>
					)}
					{source === "restore" && (
						<Badge variant="outline" className="px-1.5 py-0 text-[10px]">
							Restored
						</Badge>
					)}
				</div>
				<span
					className="truncate text-xs text-muted-foreground"
					title={absolute}
				>
					{authorName ?? "Unknown"}
				</span>
			</div>
		</button>
	);
}
