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
import { useEffect, useState } from "react";
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
	const [sessionPreviews, setSessionPreviews] = useState<
		Record<string, SessionPreview>
	>({});

	useEffect(() => {
		if (!isOpen || sessions.length === 0) return;
		let isCancelled = false;

		const loadPreviews = async () => {
			const updates: Record<string, SessionPreview> = {};

			for (const session of sessions) {
				const updatedAtMs = session.updatedAt.getTime();
				const existing = sessionPreviews[session.sessionId];
				if (existing && existing.updatedAtMs === updatedAtMs) {
					continue;
				}

				try {
					const messages = await utils.client.session.listMessages.query({
						sessionId: session.sessionId,
						...(cwd ? { cwd } : {}),
					});
					updates[session.sessionId] = {
						updatedAtMs,
						subtitle: buildSessionSubtitle(messages),
					};
				} catch {
					if (!existing) {
						updates[session.sessionId] = {
							updatedAtMs,
							subtitle: "No messages yet",
						};
					}
				}
			}

			if (isCancelled || Object.keys(updates).length === 0) return;
			setSessionPreviews((previous) => ({ ...previous, ...updates }));
		};

		void loadPreviews();
		return () => {
			isCancelled = true;
		};
	}, [
		cwd,
		isOpen,
		sessionPreviews,
		sessions,
		utils.client.session.listMessages,
	]);

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
						sessions.map((session) => (
							<SessionSelectorItem
								key={session.sessionId}
								sessionId={session.sessionId}
								title={session.title}
								updatedAt={session.updatedAt}
								subtitle={
									sessionPreviews[session.sessionId]?.subtitle ??
									"No messages yet"
								}
								isCurrent={session.sessionId === currentSessionId}
								onSelectSession={(sessionId) => {
									onSelectSession(sessionId);
									setIsOpen(false);
								}}
								onDeleteSession={onDeleteSession}
							/>
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
