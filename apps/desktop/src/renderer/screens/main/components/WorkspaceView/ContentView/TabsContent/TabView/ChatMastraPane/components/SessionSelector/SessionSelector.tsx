import {
	chatMastraServiceTrpc,
	type UseMastraChatDisplayReturn,
} from "@superset/chat-mastra/client";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	HiMiniArrowPath,
	HiMiniChatBubbleLeftRight,
	HiMiniChevronDown,
	HiMiniPlus,
} from "react-icons/hi2";
import { SessionSelectorItem } from "./components/SessionSelectorItem";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface SessionPreview {
	updatedAtMs: number;
	subtitle: string;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	cwd?: string;
	isSessionInitializing?: boolean;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

type MastraMessage = NonNullable<
	UseMastraChatDisplayReturn["messages"]
>[number];
type MastraMessagePart = MastraMessage["content"][number];

const MAX_SUBTITLE_LENGTH = 56;
const SESSION_PAGE_SIZE = 20;

function truncateSubtitle(text: string): string {
	if (text.length <= MAX_SUBTITLE_LENGTH) return text;
	return `${text.slice(0, MAX_SUBTITLE_LENGTH - 3)}...`;
}

function toMessagePreview(message: MastraMessage): string {
	const text = message.content
		.filter(
			(
				part: MastraMessagePart,
			): part is Extract<MastraMessagePart, { type: "text" }> =>
				part.type === "text",
		)
		.map((part: Extract<MastraMessagePart, { type: "text" }>) =>
			part.text.trim(),
		)
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (text) return truncateSubtitle(text);

	const attachmentCount = message.content.filter(
		(part: MastraMessagePart) => part.type === "image",
	).length;
	if (attachmentCount > 0) {
		return attachmentCount === 1
			? "1 attachment"
			: `${attachmentCount} attachments`;
	}

	return "";
}

function buildSessionSubtitle(messages: MastraMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const preview = toMessagePreview(messages[index]);
		if (preview) return preview;
	}
	return "No messages yet";
}

export function SessionSelector({
	currentSessionId,
	sessions,
	cwd,
	isSessionInitializing = false,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const utils = chatMastraServiceTrpc.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE);
	const [sessionPreviews, setSessionPreviews] = useState<
		Record<string, SessionPreview>
	>({});
	const sessionPreviewsRef = useRef(sessionPreviews);

	useEffect(() => {
		sessionPreviewsRef.current = sessionPreviews;
	}, [sessionPreviews]);

	const visibleSessions = useMemo(
		() => sessions.slice(0, visibleCount),
		[sessions, visibleCount],
	);
	const hasMoreSessions = sessions.length > visibleCount;

	useEffect(() => {
		if (!isOpen) return;
		setVisibleCount(SESSION_PAGE_SIZE);
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen || visibleSessions.length === 0) return;
		let isCancelled = false;

		const loadPreviews = async () => {
			const sessionsToFetch = visibleSessions.filter((session) => {
				const updatedAtMs = session.updatedAt.getTime();
				const existing = sessionPreviewsRef.current[session.sessionId];
				return !existing || existing.updatedAtMs !== updatedAtMs;
			});
			if (sessionsToFetch.length === 0) return;

			const responses = await Promise.all(
				sessionsToFetch.map(async (session) => {
					const updatedAtMs = session.updatedAt.getTime();
					const existing = sessionPreviewsRef.current[session.sessionId];
					if (existing && existing.updatedAtMs === updatedAtMs) {
						return null;
					}

					try {
						const messages = await utils.client.session.listMessages.query({
							sessionId: session.sessionId,
							...(cwd ? { cwd } : {}),
						});
						return {
							sessionId: session.sessionId,
							preview: {
								updatedAtMs,
								subtitle: buildSessionSubtitle(messages),
							},
						};
					} catch {
						return null;
					}
				}),
			);

			const updates: Record<string, SessionPreview> = {};
			for (const result of responses) {
				if (!result) continue;
				updates[result.sessionId] = result.preview;
			}

			if (isCancelled || Object.keys(updates).length === 0) return;
			setSessionPreviews((previous) => ({ ...previous, ...updates }));
		};

		void loadPreviews();
		return () => {
			isCancelled = true;
		};
	}, [cwd, isOpen, visibleSessions, utils.client.session.listMessages]);

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
				<DropdownMenuLabel className="text-xs">Sessions</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<div className="max-h-80 overflow-y-auto">
					{sessions.length > 0 ? (
						<>
							{visibleSessions.map((session) => (
								<SessionSelectorItem
									key={session.sessionId}
									sessionId={session.sessionId}
									title={session.title}
									updatedAt={session.updatedAt}
									subtitle={
										sessionPreviews[session.sessionId]?.subtitle ?? "Loading..."
									}
									isCurrent={session.sessionId === currentSessionId}
									onSelectSession={(sessionId) => {
										onSelectSession(sessionId);
										setIsOpen(false);
									}}
									onDeleteSession={onDeleteSession}
								/>
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
