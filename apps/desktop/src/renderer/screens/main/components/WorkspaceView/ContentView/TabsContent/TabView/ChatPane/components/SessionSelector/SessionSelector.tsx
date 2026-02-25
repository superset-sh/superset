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
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import {
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface SessionSelectorProps {
	currentSessionId: string | null;
	workspaceId: string;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

export function SessionSelector({
	currentSessionId,
	workspaceId,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const collections = useCollections();

	const { data: sessions } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) => eq(chatSessions.workspaceId, workspaceId))
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({ ...chatSessions })),
		[collections, workspaceId],
	);

	const current = sessions?.find((s) => s.id === currentSessionId);
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
					{sessions?.length ? (
						sessions.map((session) => (
							<DropdownMenuItem
								key={session.id}
								className="group flex items-center justify-between gap-2"
								onSelect={() => {
									onSelectSession(session.id);
									setIsOpen(false);
								}}
							>
								<span
									className={`min-w-0 truncate text-xs ${session.id === currentSessionId ? "font-semibold" : ""}`}
								>
									{session.title || "New Chat"}
								</span>
								{session.id !== currentSessionId && (
									<button
										type="button"
										className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
										onClick={(e) => {
											e.stopPropagation();
											alert.destructive({
												title: "Delete Chat Session",
												description: `Are you sure you want to delete "${session.title || "New Chat"}"? This action cannot be undone.`,
												confirmText: "Delete",
												onConfirm: () => {
													toast.promise(onDeleteSession(session.id), {
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
						onNewChat();
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
