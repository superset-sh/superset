"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from "../../../../constants";
import type { MockSession } from "../../../../mock-data";

function formatTimeAgo(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const minutes = Math.floor(diff / MS_PER_MINUTE);
	const hours = Math.floor(diff / MS_PER_HOUR);
	const days = Math.floor(diff / MS_PER_DAY);
	const months = Math.floor(days / 30);

	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	if (hours < 24) return `${hours}h`;
	if (days < 30) return `${days}d`;
	return `${months}mo`;
}

const statusIcons = {
	completed: <CheckCircle2 className="size-4 shrink-0 text-green-500" />,
	running: <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />,
	failed: <XCircle className="size-4 shrink-0 text-red-500" />,
};

type SessionCardProps = {
	session: MockSession;
	workspaceId: string;
};

export function SessionCard({ session, workspaceId }: SessionCardProps) {
	return (
		<Link
			href={`/agents/workspace/${workspaceId}`}
			className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
		>
			{statusIcons[session.status]}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-sm font-medium">{session.title}</span>
				<span className="truncate text-xs text-muted-foreground">
					{session.repoName} · {session.modelName}
					{(session.additions > 0 || session.deletions > 0) && (
						<>
							{" · "}
							<span className="text-green-500">+{session.additions}</span>{" "}
							<span className="text-red-500">-{session.deletions}</span>
						</>
					)}
				</span>
			</div>
			<span className="shrink-0 text-xs text-muted-foreground">
				{formatTimeAgo(session.createdAt)}
			</span>
		</Link>
	);
}
