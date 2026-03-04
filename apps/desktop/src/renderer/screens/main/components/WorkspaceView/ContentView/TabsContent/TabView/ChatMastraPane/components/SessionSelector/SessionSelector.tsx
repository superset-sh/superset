import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import {
	HiMiniArrowPath,
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
} from "react-icons/hi2";
import { getRelativeTime } from "../../../../../../../WorkspacesListView/utils";
import { SessionSelectorItem } from "./components/SessionSelectorItem";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	isSessionInitializing?: boolean;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

interface SessionGroup {
	label: string;
	sessions: SessionItem[];
}

const SESSION_PAGE_SIZE = 20;

function toSessionGroupLabel(updatedAt: Date): string {
	return getRelativeTime(updatedAt.getTime(), { format: "compact" });
}

function groupSessionsByAge(sessions: SessionItem[]): SessionGroup[] {
	const groups: SessionGroup[] = [];

	for (const session of sessions) {
		const label = toSessionGroupLabel(session.updatedAt);
		const lastGroup = groups[groups.length - 1];

		if (lastGroup?.label === label) {
			lastGroup.sessions.push(session);
			continue;
		}

		groups.push({ label, sessions: [session] });
	}

	return groups;
}

export function SessionSelector({
	currentSessionId,
	sessions,
	isSessionInitializing = false,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE);

	const visibleSessions = useMemo(
		() => sessions.slice(0, visibleCount),
		[sessions, visibleCount],
	);
	const groupedSessions = useMemo(
		() => groupSessionsByAge(visibleSessions),
		[visibleSessions],
	);
	const hasMoreSessions = sessions.length > visibleCount;

	useEffect(() => {
		if (!isOpen) return;
		setVisibleCount(SESSION_PAGE_SIZE);
	}, [isOpen]);

	const loadMoreSessions = () => {
		setVisibleCount((count) =>
			Math.min(count + SESSION_PAGE_SIZE, sessions.length),
		);
	};

	const current = sessions.find(
		(session) => session.sessionId === currentSessionId,
	);
	const currentTitle =
		current?.title || (isSessionInitializing ? "Creating Chat" : "New Chat");

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-busy={isSessionInitializing}
					className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChatBubbleLeftRight className="size-3.5" />
					<span className="max-w-[120px] truncate">{currentTitle}</span>
					{isSessionInitializing && (
						<HiMiniArrowPath className="size-3 animate-spin" />
					)}
					<HiMiniChevronDown className="size-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80">
				<div className="max-h-80 overflow-y-auto">
					{sessions.length > 0 ? (
						<>
							{groupedSessions.map((group, index) => (
								<div
									key={`${group.label}-${group.sessions[0]?.sessionId ?? index}`}
									className={
										index > 0 ? "mt-1 border-t border-border/50 pt-1" : ""
									}
								>
									<div className="px-2 py-1 text-xs text-muted-foreground">
										{group.label}
									</div>
									{group.sessions.map((session) => (
										<SessionSelectorItem
											key={session.sessionId}
											sessionId={session.sessionId}
											title={session.title}
											isCurrent={session.sessionId === currentSessionId}
											onSelectSession={(sessionId) => {
												onSelectSession(sessionId);
												setIsOpen(false);
											}}
											onDeleteSession={onDeleteSession}
										/>
									))}
								</div>
							))}
							{hasMoreSessions && (
								<div className="px-2 py-1.5">
									<button
										type="button"
										className="w-full rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={loadMoreSessions}
									>
										Show more sessions
									</button>
								</div>
							)}
						</>
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
