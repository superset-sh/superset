import { alert } from "@superset/ui/atoms/Alert";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import {
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

export function SessionSelector({
	currentSessionId,
	sessions,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);

	const sortedSessions = useMemo(() => {
		return [...sessions].sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}, [sessions]);

	const current = sortedSessions.find(
		(session) => session.sessionId === currentSessionId,
	);
	const currentTitle = current?.title || "New Chat";

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChatBubbleLeftRight className="size-3.5" />
					<span className="max-w-[120px] truncate">{currentTitle}</span>
					<HiMiniChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel className="text-xs">Sessions</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div className="max-h-80 overflow-y-auto">
					{sortedSessions.length > 0 ? (
						sortedSessions.map((session) => (
							<DropdownMenuItem
								key={session.sessionId}
								className="group flex items-center justify-between gap-2"
								onSelect={() => {
									onSelectSession(session.sessionId);
									setIsOpen(false);
								}}
							>
								<span
									className={`min-w-0 truncate text-xs ${session.sessionId === currentSessionId ? "font-semibold" : ""}`}
								>
									{session.title || "New Chat"}
								</span>
								{session.sessionId !== currentSessionId && (
									<button
										type="button"
										className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
										onClick={(event) => {
											event.stopPropagation();
											alert.destructive({
												title: "Delete Chat Session",
												description:
													"Are you sure you want to delete this session?",
												confirmText: "Delete",
												onConfirm: () => {
													toast.promise(onDeleteSession(session.sessionId), {
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
							</DropdownMenuItem>
						))
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No sessions yet
						</div>
					)}
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void onNewChat();
						setIsOpen(false);
					}}
				>
					<HiMiniPlus className="mr-1.5 size-3.5" />
					<span className="text-xs">New Chat</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
