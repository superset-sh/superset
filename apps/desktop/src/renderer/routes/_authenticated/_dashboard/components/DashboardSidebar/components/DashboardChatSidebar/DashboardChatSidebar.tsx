import { cn } from "@superset/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare, Plus } from "lucide-react";
import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface DashboardChatSidebarProps {
	activeWorkspaceId: string | null;
	activeSessionId: string | null;
	isCollapsed: boolean;
}

function toSessionTitle(title: string | null): string {
	const trimmed = title?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "New Chat";
}

export function DashboardChatSidebar({
	activeWorkspaceId,
	activeSessionId,
	isCollapsed,
}: DashboardChatSidebarProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const { data: workspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ workspace: collections.v2Workspaces })
				.where(({ workspace }) => eq(workspace.id, activeWorkspaceId ?? ""))
				.select(({ workspace }) => ({
					id: workspace.id,
					name: workspace.name,
					branch: workspace.branch,
				})),
		[collections.v2Workspaces, activeWorkspaceId],
	);
	const workspace = activeWorkspaceId ? (workspaceRows[0] ?? null) : null;

	const { data: sessionRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ session: collections.chatSessions })
				.where(({ session }) =>
					eq(session.v2WorkspaceId, activeWorkspaceId ?? ""),
				)
				.orderBy(({ session }) => session.lastActiveAt, "desc")
				.select(({ session }) => ({
					id: session.id,
					title: session.title,
				})),
		[collections.chatSessions, activeWorkspaceId],
	);

	const sessions = useMemo(
		() => sessionRows.filter((session) => session != null),
		[sessionRows],
	);

	const openWorkspaceChat = (sessionId?: string) => {
		if (!activeWorkspaceId) {
			void navigate({ to: "/chat" });
			return;
		}
		void navigate({
			to: "/v2-workspace/$workspaceId/chat",
			params: { workspaceId: activeWorkspaceId },
			search: sessionId ? { chatSessionId: sessionId } : {},
		});
	};

	if (isCollapsed) {
		return <div className="flex-1" />;
	}

	if (!activeWorkspaceId) {
		return (
			<div className="flex min-h-0 flex-1 flex-col px-3 py-3">
				<div className="rounded-md border border-border/70 bg-background/70 px-3 py-3">
					<div className="text-sm font-medium text-foreground">Chat</div>
					<div className="mt-1 text-xs text-muted-foreground">
						Select a workspace to start.
					</div>
					<button
						type="button"
						onClick={() => navigate({ to: "/chat" })}
						className="mt-3 flex w-full items-center justify-center rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/80"
					>
						Choose workspace
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="border-b border-border px-3 py-2">
				<div className="truncate text-xs font-medium text-muted-foreground">
					{workspace?.name || workspace?.branch || "Workspace"}
				</div>
				<button
					type="button"
					onClick={() => openWorkspaceChat()}
					className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
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
							return (
								<button
									key={session.id}
									type="button"
									onClick={() => openWorkspaceChat(session.id)}
									className={cn(
										"flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
										selected
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
									)}
								>
									<MessageSquare className="size-3.5 shrink-0" />
									<span className="min-w-0 flex-1 truncate">
										{toSessionTitle(session.title)}
									</span>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
