import type { SelectSessionHost } from "@superset/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo, useState } from "react";
import {
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

type TimeGroup =
	| "Today"
	| "Yesterday"
	| "This Week"
	| "Last Week"
	| "This Month"
	| "Older";

const TIME_GROUP_ORDER: TimeGroup[] = [
	"Today",
	"Yesterday",
	"This Week",
	"Last Week",
	"This Month",
	"Older",
];

function getTimeGroup(date: Date): TimeGroup {
	const now = new Date();

	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	);
	const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
	const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
	const startOfThisWeek = new Date(
		startOfToday.getTime() - (dayOfWeek - 1) * 86_400_000,
	);
	const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86_400_000);
	const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

	if (date >= startOfToday) return "Today";
	if (date >= startOfYesterday) return "Yesterday";
	if (date >= startOfThisWeek) return "This Week";
	if (date >= startOfLastWeek) return "Last Week";
	if (date >= startOfThisMonth) return "This Month";
	return "Older";
}

function formatRelativeTime(date: Date): string {
	const diff = Date.now() - date.getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString();
}

interface SessionSelectorProps {
	currentSessionId: string;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => void;
	onDeleteSession: (sessionId: string) => void;
}

export function SessionSelector({
	currentSessionId,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const collections = useCollections();

	const { data: sessions } = useLiveQuery(
		(q) =>
			q
				.from({ sessionHosts: collections.sessionHosts })
				.orderBy(({ sessionHosts }) => sessionHosts.lastActiveAt, "desc")
				.select(({ sessionHosts }) => sessionHosts),
		[collections],
	);

	const grouped = useMemo(() => {
		if (!sessions?.length) return [];

		const groups = new Map<TimeGroup, SelectSessionHost[]>();
		for (const session of sessions) {
			const group = getTimeGroup(session.lastActiveAt);
			const existing = groups.get(group);
			if (existing) {
				existing.push(session);
			} else {
				groups.set(group, [session]);
			}
		}

		return TIME_GROUP_ORDER.filter((g) => groups.has(g)).map((group) => ({
			label: group,
			sessions: groups.get(group) ?? [],
		}));
	}, [sessions]);

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
					<span className="max-w-[120px] truncate">Chat</span>
					<HiMiniChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<div className="flex items-center justify-between px-2 py-1.5">
					<DropdownMenuLabel className="p-0 text-xs">
						Sessions
					</DropdownMenuLabel>
				</div>
				<DropdownMenuSeparator />

				<div className="max-h-80 overflow-y-auto">
					{grouped.length > 0 ? (
						grouped.map((group) => (
							<div key={group.label}>
								<DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
									{group.label}
								</DropdownMenuLabel>
								{group.sessions.map((session) => (
									<DropdownMenuItem
										key={session.id}
										className="group flex items-center justify-between gap-2"
										onSelect={() => handleSelect(session.id)}
									>
										<div className="flex min-w-0 flex-1 flex-col">
											<span
												className={`truncate text-xs ${
													session.id === currentSessionId
														? "font-semibold"
														: ""
												}`}
											>
												Chat
											</span>
											<span className="text-[10px] text-muted-foreground">
												{formatRelativeTime(session.lastActiveAt)}
											</span>
										</div>
										{session.id !== currentSessionId && (
											<button
												type="button"
												className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
												onClick={(e) => handleDelete(e, session.id)}
											>
												<HiMiniTrash className="size-3" />
											</button>
										)}
									</DropdownMenuItem>
								))}
							</div>
						))
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No sessions found
						</div>
					)}
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={handleNewChat}>
					<HiMiniPlus className="mr-1.5 size-3.5" />
					<span className="text-xs">New Chat</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
