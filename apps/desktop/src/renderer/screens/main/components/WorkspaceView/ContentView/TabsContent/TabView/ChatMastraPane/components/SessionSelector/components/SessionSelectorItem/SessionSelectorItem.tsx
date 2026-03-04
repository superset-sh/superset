import { alert } from "@superset/ui/atoms/Alert";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { HiMiniTrash } from "react-icons/hi2";
import { getRelativeTime } from "../../../../../../../../../WorkspacesListView/utils";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	updatedAt: Date;
	subtitle: string;
	isCurrent: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

export function SessionSelectorItem({
	sessionId,
	title,
	updatedAt,
	subtitle,
	isCurrent,
	onSelectSession,
	onDeleteSession,
}: SessionSelectorItemProps) {
	return (
		<DropdownMenuItem
			className="group flex items-center gap-2"
			onSelect={() => {
				onSelectSession(sessionId);
			}}
		>
			<span
				className={`min-w-0 truncate text-xs ${isCurrent ? "font-semibold" : ""}`}
			>
				{title || "New Chat"}
			</span>
			<div className="ml-auto flex min-w-0 items-center gap-2">
				<span className="max-w-[120px] truncate text-[11px] text-muted-foreground">
					{subtitle}
				</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{getRelativeTime(updatedAt.getTime())}
				</span>
				{!isCurrent && (
					<button
						type="button"
						className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
						onClick={(event) => {
							event.stopPropagation();
							alert.destructive({
								title: "Delete Chat Session",
								description: "Are you sure you want to delete this session?",
								confirmText: "Delete",
								onConfirm: () => {
									toast.promise(onDeleteSession(sessionId), {
										loading: "Deleting session...",
										success: "Session deleted",
										error: "Failed to delete session",
									});
								},
							});
						}}
					>
						<HiMiniTrash className="size-3" />
					</button>
				)}
			</div>
		</DropdownMenuItem>
	);
}
