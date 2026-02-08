import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useCallback, useState } from "react";
import {
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

interface SessionSelectorProps {
	workspaceId: string;
	currentSessionId: string;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => void;
	onDeleteSession: (sessionId: string) => void;
}

export function SessionSelector({
	workspaceId,
	currentSessionId,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);

	const { data: sessions } = electronTrpc.aiChat.listSessions.useQuery(
		{ workspaceId },
		{ enabled: isOpen },
	);

	const currentSession = sessions?.find(
		(s) => s.sessionId === currentSessionId,
	);
	const displayTitle = currentSession?.title ?? "Chat";

	const handleSelect = useCallback(
		(sessionId: string) => {
			if (sessionId !== currentSessionId) {
				onSelectSession(sessionId);
			}
			setIsOpen(false);
		},
		[currentSessionId, onSelectSession],
	);

	const handleDelete = useCallback(
		(e: React.MouseEvent, sessionId: string) => {
			e.stopPropagation();
			onDeleteSession(sessionId);
		},
		[onDeleteSession],
	);

	const handleNewChat = useCallback(() => {
		onNewChat();
		setIsOpen(false);
	}, [onNewChat]);

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChatBubbleLeftRight className="size-3.5" />
					<span className="max-w-[120px] truncate">{displayTitle}</span>
					<HiMiniChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel className="text-xs">Sessions</DropdownMenuLabel>
				<DropdownMenuSeparator />

				{sessions && sessions.length > 0 ? (
					sessions.map((session) => (
						<DropdownMenuItem
							key={session.sessionId}
							className="group flex items-center justify-between gap-2"
							onSelect={() => handleSelect(session.sessionId)}
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span
									className={`truncate text-xs ${
										session.sessionId === currentSessionId
											? "font-semibold"
											: ""
									}`}
								>
									{session.title}
								</span>
								<span className="text-[10px] text-muted-foreground">
									{formatRelativeTime(session.lastActiveAt)}
									{session.messagePreview && (
										<>
											{" — "}
											<span className="truncate">{session.messagePreview}</span>
										</>
									)}
								</span>
							</div>
							{session.sessionId !== currentSessionId && (
								<button
									type="button"
									className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
									onClick={(e) => handleDelete(e, session.sessionId)}
								>
									<HiMiniTrash className="size-3" />
								</button>
							)}
						</DropdownMenuItem>
					))
				) : (
					<div className="px-2 py-1.5 text-xs text-muted-foreground">
						No previous sessions
					</div>
				)}

				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={handleNewChat}>
					<HiMiniPlus className="mr-1.5 size-3.5" />
					<span className="text-xs">New Chat</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
