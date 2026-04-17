import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { Check } from "lucide-react";

type Commit =
	inferRouterOutputs<AppRouter>["git"]["listCommits"]["commits"][number];

function timeAgo(date: string): string {
	const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

interface CommitRowProps {
	commit: Commit;
	isSelected?: boolean;
}

export function CommitRow({ commit, isSelected }: CommitRowProps) {
	return (
		<div className="flex flex-1 items-center justify-between">
			<div className="min-w-0">
				<div className="truncate text-sm">{commit.message}</div>
				<div className="text-xs text-muted-foreground">
					{commit.shortHash} · {commit.author} · {timeAgo(commit.date)}
				</div>
			</div>
			{isSelected && <Check className="size-3.5 shrink-0" />}
		</div>
	);
}
