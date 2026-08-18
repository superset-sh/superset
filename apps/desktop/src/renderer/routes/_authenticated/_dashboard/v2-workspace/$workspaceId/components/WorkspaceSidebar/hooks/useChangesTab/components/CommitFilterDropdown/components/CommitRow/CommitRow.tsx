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
	wrap?: boolean;
}

export function CommitRow({
	commit,
	isSelected,
	wrap = false,
}: CommitRowProps) {
	return (
		<div className="flex min-w-0 flex-1 items-start justify-between gap-2">
			<div className="min-w-0 flex-1 overflow-hidden">
				<div className={wrap ? "text-sm wrap-break-word" : "truncate text-sm"}>
					{commit.message}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{commit.shortHash} · {commit.author} · {timeAgo(commit.date)}
				</div>
			</div>
			{isSelected && <Check className="mt-0.5 size-3.5 shrink-0" />}
		</div>
	);
}
