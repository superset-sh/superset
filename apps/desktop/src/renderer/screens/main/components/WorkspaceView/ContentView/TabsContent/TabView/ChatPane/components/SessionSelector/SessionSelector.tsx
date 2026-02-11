import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
	HiMiniTrash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

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

const PAGE_SIZE = 30;

function getTimeGroup(timestamp: number): TimeGroup {
	const now = new Date();
	const date = new Date(timestamp);

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

interface UnifiedSession {
	sessionId: string;
	display: string;
	timestamp: number;
	gitBranch: string | null;
	source: "superset" | "claude-code";
	messagePreview?: string;
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
	const [cursor, setCursor] = useState(0);
	const [allClaudeSessions, setAllClaudeSessions] = useState<UnifiedSession[]>(
		[],
	);
	const [hasMore, setHasMore] = useState(true);
	const [total, setTotal] = useState(0);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const { data: sessions } = electronTrpc.aiChat.listSessions.useQuery(
		{ workspaceId },
		{ enabled: isOpen },
	);

	const { data: claudePage, isLoading: isScanning } =
		electronTrpc.aiChat.scanClaudeSessions.useQuery(
			{ cursor, limit: PAGE_SIZE },
			{
				enabled: isOpen,
				staleTime: 5 * 60_000,
			},
		);

	// Accumulate Claude sessions as pages load
	useEffect(() => {
		if (!claudePage) return;
		setTotal(claudePage.total);
		setHasMore(claudePage.nextCursor !== null);

		if (cursor === 0) {
			setAllClaudeSessions(
				claudePage.sessions.map((s) => ({
					sessionId: s.sessionId,
					display: s.display || "Untitled session",
					timestamp: s.timestamp,
					gitBranch: s.gitBranch,
					source: "claude-code" as const,
				})),
			);
		} else {
			setAllClaudeSessions((prev) => {
				const existingIds = new Set(prev.map((s) => s.sessionId));
				const newSessions = claudePage.sessions
					.filter((s) => !existingIds.has(s.sessionId))
					.map((s) => ({
						sessionId: s.sessionId,
						display: s.display || "Untitled session",
						timestamp: s.timestamp,
						gitBranch: s.gitBranch,
						source: "claude-code" as const,
					}));
				return [...prev, ...newSessions];
			});
		}
	}, [claudePage, cursor]);

	// IntersectionObserver to trigger loading more when sentinel is visible
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !isOpen) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasMore && !isScanning) {
					setCursor((prev) => prev + PAGE_SIZE);
				}
			},
			{ root: scrollRef.current, threshold: 0.1 },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [isOpen, hasMore, isScanning]);

	const currentSession = sessions?.find(
		(s) => s.sessionId === currentSessionId,
	);
	const displayTitle = currentSession?.title ?? "Chat";

	const grouped = useMemo(() => {
		const unified: UnifiedSession[] = [];
		const seenIds = new Set<string>();

		// Superset sessions first
		if (sessions) {
			for (const s of sessions) {
				seenIds.add(s.sessionId);
				unified.push({
					sessionId: s.sessionId,
					display: s.title,
					timestamp: s.lastActiveAt,
					gitBranch: null,
					source: "superset",
					messagePreview: s.messagePreview,
				});
			}
		}

		// Claude Code sessions (skip duplicates)
		for (const s of allClaudeSessions) {
			if (seenIds.has(s.sessionId)) continue;
			seenIds.add(s.sessionId);
			unified.push(s);
		}

		// Group by time
		const groups = new Map<TimeGroup, UnifiedSession[]>();
		for (const session of unified) {
			const group = getTimeGroup(session.timestamp);
			const existing = groups.get(group);
			if (existing) {
				existing.push(session);
			} else {
				groups.set(group, [session]);
			}
		}

		for (const items of groups.values()) {
			items.sort((a, b) => b.timestamp - a.timestamp);
		}

		return TIME_GROUP_ORDER.filter((g) => groups.has(g)).map((group) => ({
			label: group,
			sessions: groups.get(group) ?? [],
		}));
	}, [sessions, allClaudeSessions]);

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

	const loadedCount = allClaudeSessions.length + (sessions?.length ?? 0);

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
			<DropdownMenuContent align="start" className="w-72">
				<div className="flex items-center justify-between px-2 py-1.5">
					<DropdownMenuLabel className="p-0 text-xs">
						Sessions
					</DropdownMenuLabel>
					<span className="text-[10px] text-muted-foreground">
						{isScanning
							? "Loading..."
							: total > 0
								? `${loadedCount} / ${total}`
								: null}
					</span>
				</div>
				<DropdownMenuSeparator />

				<div ref={scrollRef} className="max-h-80 overflow-y-auto">
					{grouped.length > 0 ? (
						grouped.map((group) => (
							<div key={group.label}>
								<DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
									{group.label}
								</DropdownMenuLabel>
								{group.sessions.map((session) => (
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
												{session.display}
											</span>
											<span className="flex w-full items-center gap-1 text-[10px] text-muted-foreground">
												{formatRelativeTime(session.timestamp)}
												{session.gitBranch && (
													<>
														{" · "}
														<span className="truncate rounded bg-muted px-1">
															{session.gitBranch}
														</span>
													</>
												)}
												{session.messagePreview && (
													<>
														{" — "}
														<span className="truncate">
															{session.messagePreview}
														</span>
													</>
												)}
											</span>
										</div>
										{session.sessionId !== currentSessionId &&
											session.source === "superset" && (
												<button
													type="button"
													className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
													onClick={(e) => handleDelete(e, session.sessionId)}
												>
													<HiMiniTrash className="size-3" />
												</button>
											)}
									</DropdownMenuItem>
								))}
							</div>
						))
					) : !isScanning ? (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No sessions found
						</div>
					) : null}

					{/* Sentinel for infinite scroll */}
					{hasMore && (
						<div ref={sentinelRef} className="px-2 py-1.5">
							{isScanning && (
								<span className="text-[10px] text-muted-foreground">
									Loading more...
								</span>
							)}
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
