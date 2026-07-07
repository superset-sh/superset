import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { HiPlus } from "react-icons/hi2";
import { useHotkey } from "renderer/hotkeys";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function formatTimeAgo(value: Date | string | null): string {
	if (!value) return "";
	const time =
		value instanceof Date ? value.getTime() : new Date(value).getTime();
	if (Number.isNaN(time)) return "";
	const diff = Date.now() - time;
	if (diff < MS_PER_MINUTE) return "now";
	if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m`;
	if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h`;
	const days = Math.floor(diff / MS_PER_DAY);
	if (days < 30) return `${days}d`;
	return `${Math.floor(days / 30)}mo`;
}

export function DashboardSidebarChats({
	isCollapsed = false,
}: {
	isCollapsed?: boolean;
}) {
	const collections = useCollections();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const { activeHostUrl } = useLocalHostService();
	const { chatSessions: chatSessionActions } = useOptimisticCollectionActions();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	// Freeform chats have no workspace (both workspace links are null). Filter in
	// JS: tanstack/db `eq(col, null)` uses SQL-style equality and never matches
	// null values, so the where-clause approach silently returns nothing.
	const { data: allChats = [] } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
					lastActiveAt: chatSessions.lastActiveAt,
					v2WorkspaceId: chatSessions.v2WorkspaceId,
					workspaceId: chatSessions.workspaceId,
					createdBy: chatSessions.createdBy,
				})),
		[collections.chatSessions],
	);
	// Only the current user's freeform chats: the collection syncs every org
	// member's sessions, but freeform chats are personal and only their creator
	// can delete them — showing others' would be un-deletable clutter. When the
	// user id isn't resolved yet, don't hide everything — fall back to all.
	const chats = useMemo(
		() =>
			allChats.filter(
				(c) =>
					!c.v2WorkspaceId &&
					!c.workspaceId &&
					(userId ? c.createdBy === userId : true),
			),
		[allChats, userId],
	);

	const chatMatch = matchRoute({ to: "/chat/$sessionId", fuzzy: true });
	const currentChatId = chatMatch !== false ? chatMatch.sessionId : null;

	const goToChat = useCallback(
		(sessionId: string) =>
			navigate({ to: "/chat/$sessionId", params: { sessionId } }),
		[navigate],
	);

	const startNewChat = useCallback(
		() => goToChat(crypto.randomUUID()),
		[goToChat],
	);

	const deleteChat = useCallback(
		(sessionId: string) => {
			const remaining = chats.filter((c) => c.id !== sessionId);
			chatSessionActions.deleteSession(sessionId);
			// Best-effort teardown of the host-side runtime so it doesn't leak.
			if (activeHostUrl) {
				void getHostServiceClientByUrl(activeHostUrl)
					.chat.endSession.mutate({ sessionId })
					.catch(() => {});
			}
			// If we deleted the chat we're viewing, move to a neighbour (or a fresh
			// chat if none remain) so we're not left on a dead route.
			if (sessionId === currentChatId) {
				goToChat(remaining[0]?.id ?? crypto.randomUUID());
			}
		},
		[chats, chatSessionActions, activeHostUrl, currentChatId, goToChat],
	);

	const cycleChat = useCallback(
		(direction: 1 | -1) => {
			if (chats.length === 0) return;
			const index = chats.findIndex((c) => c.id === currentChatId);
			if (index === -1) {
				// Not on a chat — enter the list from the appropriate end.
				goToChat((direction === 1 ? chats[0] : chats[chats.length - 1]).id);
				return;
			}
			const nextIndex = (index + direction + chats.length) % chats.length;
			goToChat(chats[nextIndex].id);
		},
		[chats, currentChatId, goToChat],
	);

	useHotkey("NEW_FREEFORM_CHAT", startNewChat);
	useHotkey("NEXT_FREEFORM_CHAT", () => cycleChat(1));
	useHotkey("PREV_FREEFORM_CHAT", () => cycleChat(-1));
	useHotkey("DELETE_FREEFORM_CHAT", () => {
		if (currentChatId) deleteChat(currentChatId);
	});

	if (isCollapsed) return null;

	return (
		<section className="border-b border-border">
			<div className="group/chats flex min-h-10 items-center pl-3 pr-2 py-1.5">
				<span className="flex-1 text-sm font-medium text-muted-foreground">
					Chats
				</span>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="New chat"
							onClick={startNewChat}
							className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/chats:opacity-100 focus-visible:opacity-100"
						>
							<HiPlus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">New chat</TooltipContent>
				</Tooltip>
			</div>

			<div className="flex flex-col pb-1">
				{chats.map((chat) => {
					const isActive =
						matchRoute({
							to: "/chat/$sessionId",
							params: { sessionId: chat.id },
						}) !== false;
					return (
						<ContextMenu key={chat.id}>
							<ContextMenuTrigger asChild>
								<div
									className={cn(
										"group/row relative flex min-h-9 items-center pl-3 pr-2 text-sm transition-colors",
										isActive
											? "bg-accent text-foreground"
											: "text-foreground/90 hover:bg-accent/50",
									)}
								>
									<button
										type="button"
										onClick={() => goToChat(chat.id)}
										className="flex min-h-9 min-w-0 flex-1 items-center py-1.5 text-left"
									>
										<span className="min-w-0 flex-1 truncate">
											{chat.title?.trim() || "New chat"}
										</span>
									</button>
									<span className="ml-2 shrink-0 text-[10px] tabular-nums text-muted-foreground group-hover/row:hidden">
										{formatTimeAgo(chat.lastActiveAt)}
									</span>
									<button
										type="button"
										aria-label="Delete chat"
										onClick={() => deleteChat(chat.id)}
										className="ml-1 hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive group-hover/row:flex"
									>
										<Trash2 className="size-3.5" />
									</button>
								</div>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem
									variant="destructive"
									onSelect={() => deleteChat(chat.id)}
								>
									<Trash2 className="size-4" />
									Delete chat
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
					);
				})}
			</div>
		</section>
	);
}
