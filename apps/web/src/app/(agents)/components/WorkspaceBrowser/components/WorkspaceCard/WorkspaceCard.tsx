"use client";

import { ChevronRight, GitBranch } from "lucide-react";
import Link from "next/link";
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from "../../../../constants";
import type { MockProject, MockWorkspace } from "../../../../mock-data";

function formatTimeAgo(date: Date | null): string {
	if (!date) {
		return "No sessions yet";
	}

	const now = Date.now();
	const diff = now - date.getTime();
	const minutes = Math.floor(diff / MS_PER_MINUTE);
	const hours = Math.floor(diff / MS_PER_HOUR);
	const days = Math.floor(diff / MS_PER_DAY);
	const months = Math.floor(days / 30);

	if (minutes < 1) return "Updated now";
	if (minutes < 60) return `Updated ${minutes}m ago`;
	if (hours < 24) return `Updated ${hours}h ago`;
	if (days < 30) return `Updated ${days}d ago`;
	return `Updated ${months}mo ago`;
}

type WorkspaceCardProps = {
	lastActiveAt: Date | null;
	project: MockProject;
	sessionCount: number;
	workspace: MockWorkspace;
};

export function WorkspaceCard({
	lastActiveAt,
	project,
	sessionCount,
	workspace,
}: WorkspaceCardProps) {
	return (
		<Link
			href={`/workspace/${workspace.id}`}
			className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/30"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-sm font-medium">{workspace.name}</span>
					<span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
						{project.name}
					</span>
				</div>
				<p className="truncate text-xs text-muted-foreground">
					{workspace.repoFullName}
				</p>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="inline-flex items-center gap-1">
						<GitBranch className="size-3.5" />
						{workspace.branch}
					</span>
					<span>
						{sessionCount} session{sessionCount === 1 ? "" : "s"}
					</span>
					<span>{formatTimeAgo(lastActiveAt)}</span>
				</div>
			</div>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</Link>
	);
}
