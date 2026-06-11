import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import {
	Copy,
	FileText,
	Link,
	MessageSquare,
	Plus,
	Trash2,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { createChatRuntimeServiceIpcClient } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/ChatPane/utils/chat-runtime-service-client";
import { PROTOCOL_SCHEME } from "shared/constants";

interface DashboardChatSidebarProps {
	activeSessionId: string | null;
	isCollapsed: boolean;
}

function toSessionTitle(title: string | null): string {
	const trimmed = title?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "New Chat";
}

const chatRuntimeIpcClient = createChatRuntimeServiceIpcClient();

type StandaloneChatMessage = Awaited<
	ReturnType<typeof chatRuntimeIpcClient.session.listMessages.query>
>[number];

function textFromMessageContent(content: StandaloneChatMessage["content"]) {
	return content
		.map((part) => {
			if (part.type === "text") return part.text;
			if (part.type === "file") {
				return part.filename ? `[File: ${part.filename}]` : "[File]";
			}
			if (part.type === "image") return "[Image]";
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function messagesToMarkdown(args: {
	title: string;
	messages: StandaloneChatMessage[];
}): string {
	const body = args.messages
		.map((message) => {
			const role = message.role === "user" ? "User" : "Assistant";
			const text = textFromMessageContent(message.content).trim();
			return `## ${role}\n\n${text || "_No text content._"}`;
		})
		.join("\n\n");
	return [`# ${args.title}`, "", body || "_No messages in this conversation._"]
		.join("\n")
		.trim();
}

export function DashboardChatSidebar({
	activeSessionId,
	isCollapsed,
}: DashboardChatSidebarProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const { chatSessions: chatSessionActions } = useOptimisticCollectionActions();
	const { copyToClipboard } = useCopyToClipboard();

	const { data: sessionRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ session: collections.chatSessions })
				.where(({ session }) => isNull(session.workspaceId))
				.orderBy(({ session }) => session.lastActiveAt, "desc")
				.select(({ session }) => ({
					id: session.id,
					title: session.title,
					v2WorkspaceId: session.v2WorkspaceId,
				})),
		[collections.chatSessions],
	);

	const sessions = useMemo(
		() =>
			sessionRows.filter(
				(session) => session != null && session.v2WorkspaceId === null,
			),
		[sessionRows],
	);

	const openChat = useCallback(
		(sessionId?: string) => {
			void navigate({
				to: "/chat",
				search: sessionId ? { chatSessionId: sessionId } : {},
			});
		},
		[navigate],
	);

	const handleCopyTitle = useCallback(
		async (title: string) => {
			try {
				await copyToClipboard(title);
				toast.success("Copied title");
			} catch (error) {
				toast.error("Failed to copy title", {
					description:
						error instanceof Error ? error.message : "Clipboard write failed.",
				});
			}
		},
		[copyToClipboard],
	);

	const handleCopyAppLink = useCallback(
		async (sessionId: string) => {
			try {
				const url = `${PROTOCOL_SCHEME}://chat?chatSessionId=${encodeURIComponent(sessionId)}`;
				await copyToClipboard(url);
				toast.success("Copied app link");
			} catch (error) {
				toast.error("Failed to copy app link", {
					description:
						error instanceof Error ? error.message : "Clipboard write failed.",
				});
			}
		},
		[copyToClipboard],
	);

	const handleCopyMarkdown = useCallback(
		async (sessionId: string, title: string) => {
			try {
				const messages = await chatRuntimeIpcClient.session.listMessages.query({
					sessionId,
				});
				if (messages.length === 0) {
					throw new Error(
						"This conversation is not loaded locally yet. Open it and try again.",
					);
				}
				await copyToClipboard(messagesToMarkdown({ title, messages }));
				toast.success("Copied conversation as Markdown");
			} catch (error) {
				toast.error("Failed to copy Markdown", {
					description:
						error instanceof Error
							? error.message
							: "Open the conversation and try again.",
				});
			}
		},
		[copyToClipboard],
	);

	const handleDeleteSession = useCallback(
		(sessionId: string) => {
			const transaction = chatSessionActions.deleteSession(sessionId);
			if (!transaction) {
				toast.error("Failed to delete chat session");
				return;
			}
			void transaction.isPersisted.promise.catch(() => {});
			if (sessionId === activeSessionId) {
				openChat();
			}
		},
		[activeSessionId, chatSessionActions, openChat],
	);

	const handleNewChat = useCallback(() => {
		void navigate({
			to: "/chat",
			search: {},
		});
	}, [navigate]);

	if (isCollapsed) {
		return <div className="flex-1" />;
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="border-b border-border px-3 py-2">
				<button
					type="button"
					onClick={handleNewChat}
					className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<Plus className="size-4 shrink-0" />
					<span>New chat</span>
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 hide-scrollbar">
				{sessions.length === 0 ? (
					<div className="px-2 py-3 text-xs text-muted-foreground">
						No chats yet.
					</div>
				) : (
					<div className="flex flex-col gap-1">
						{sessions.map((session) => {
							const selected = session.id === activeSessionId;
							const title = toSessionTitle(session.title);
							return (
								<ContextMenu key={session.id}>
									<ContextMenuTrigger asChild>
										<button
											type="button"
											onClick={() => openChat(session.id)}
											className={cn(
												"flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
												selected
													? "bg-accent text-foreground"
													: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
											)}
										>
											<MessageSquare className="size-3.5 shrink-0" />
											<span className="min-w-0 flex-1 truncate">{title}</span>
										</button>
									</ContextMenuTrigger>
									<ContextMenuContent className="w-56">
										<ContextMenuItem
											onSelect={() => {
												void handleCopyTitle(title);
											}}
										>
											<Copy className="size-4" />
											Copy title
										</ContextMenuItem>
										<ContextMenuItem
											onSelect={() => {
												void handleCopyAppLink(session.id);
											}}
										>
											<Link className="size-4" />
											Copy app link
										</ContextMenuItem>
										<ContextMenuItem
											onSelect={() => {
												void handleCopyMarkdown(session.id, title);
											}}
										>
											<FileText className="size-4" />
											Copy as Markdown
										</ContextMenuItem>
										<ContextMenuSeparator />
										<ContextMenuItem
											variant="destructive"
											onSelect={() => handleDeleteSession(session.id)}
										>
											<Trash2 className="size-4" />
											Delete
										</ContextMenuItem>
									</ContextMenuContent>
								</ContextMenu>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
