import { alert } from "@superset/ui/atoms/Alert";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { HiMiniTrash } from "react-icons/hi2";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	isCurrent: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

export function SessionSelectorItem({
	sessionId,
	title,
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
				className={`min-w-0 flex-1 truncate text-xs ${isCurrent ? "font-semibold" : ""}`}
			>
				{title || "New Chat"}
			</span>
			{!isCurrent && (
				<button
					type="button"
					className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
					onClick={(event) => {
						event.stopPropagation();
						alert({
							title: "Delete Chat Session",
							description: "Are you sure you want to delete this session?",
							actions: [
								{ label: "Cancel", variant: "outline", onClick: () => {} },
								{
									label: "Delete",
									variant: "destructive",
									onClick: () => {
										toast.promise(onDeleteSession(sessionId), {
											loading: "Deleting session...",
											success: "Session deleted",
											error: "Failed to delete session",
										});
									},
								},
							],
						});
					}}
				>
					<HiMiniTrash className="size-3" />
				</button>
			)}
		</DropdownMenuItem>
	);
}
