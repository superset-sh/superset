/**
 * Sidebar list of chat sessions
 */

"use client";

import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { MessageSquare, Plus } from "lucide-react";
import Link from "next/link";

export interface ChatSessionItem {
	id: string;
	title: string;
	updatedAt: Date;
	creatorName?: string | null;
}

export interface ChatSessionListProps {
	sessions: ChatSessionItem[];
	activeSessionId?: string;
	onNewChat?: () => void;
	className?: string;
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

export function ChatSessionList({
	sessions,
	activeSessionId,
	onNewChat,
	className,
}: ChatSessionListProps) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="flex items-center justify-between mb-2">
				<h2 className="text-lg font-medium">Chat Sessions</h2>
				{onNewChat && (
					<Button size="sm" variant="outline" onClick={onNewChat}>
						<Plus className="h-4 w-4 mr-1" />
						New
					</Button>
				)}
			</div>

			{sessions.length === 0 ? (
				<div className="text-center py-8 text-muted-foreground">
					<MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
					<p className="text-sm">No chat sessions yet</p>
					<p className="text-xs mt-1">Start a new chat to begin</p>
				</div>
			) : (
				<div className="flex flex-col gap-1">
					{sessions.map((session) => (
						<Link
							key={session.id}
							href={`/chat/${session.id}`}
							className={cn(
								"flex items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50",
								activeSessionId === session.id && "bg-muted",
							)}
						>
							<MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{session.title}</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									{session.creatorName && `${session.creatorName} · `}
									{formatRelativeTime(session.updatedAt)}
								</p>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
