import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { HiPlus } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

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

	// Freeform chats have no workspace (both workspace links are null).
	const { data: chats = [] } = useLiveQuery(
		(q) =>
			q
				.from({ chatSessions: collections.chatSessions })
				.where(({ chatSessions }) =>
					and(
						eq(chatSessions.v2WorkspaceId, null),
						eq(chatSessions.workspaceId, null),
					),
				)
				.orderBy(({ chatSessions }) => chatSessions.lastActiveAt, "desc")
				.select(({ chatSessions }) => ({
					id: chatSessions.id,
					title: chatSessions.title,
					lastActiveAt: chatSessions.lastActiveAt,
				})),
		[collections.chatSessions],
	);

	const startNewChat = () => {
		navigate({
			to: "/chat/$sessionId",
			params: { sessionId: crypto.randomUUID() },
		});
	};

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
						<button
							key={chat.id}
							type="button"
							onClick={() =>
								navigate({
									to: "/chat/$sessionId",
									params: { sessionId: chat.id },
								})
							}
							className={cn(
								"group/row flex min-h-9 items-center gap-2 pl-3 pr-2 py-1.5 text-sm transition-colors",
								isActive
									? "bg-accent text-foreground"
									: "text-foreground/90 hover:bg-accent/50",
							)}
						>
							<span className="min-w-0 flex-1 truncate text-left">
								{chat.title?.trim() || "New chat"}
							</span>
							<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
								{formatTimeAgo(chat.lastActiveAt)}
							</span>
						</button>
					);
				})}
			</div>
		</section>
	);
}
