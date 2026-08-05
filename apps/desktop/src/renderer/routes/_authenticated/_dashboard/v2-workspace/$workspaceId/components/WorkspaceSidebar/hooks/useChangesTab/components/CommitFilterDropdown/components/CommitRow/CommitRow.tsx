import type { AppRouter } from "@superset/host-service";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import type { inferRouterOutputs } from "@trpc/server";
import { Check } from "lucide-react";
import { useState } from "react";

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
	workspaceId: string;
	isSelected?: boolean;
	wrap?: boolean;
}

export function CommitRow({
	commit,
	workspaceId,
	isSelected,
	wrap = false,
}: CommitRowProps) {
	const [open, setOpen] = useState(false);

	// listCommits only carries `%s`, so the body is fetched per commit and only
	// once the card is actually opened. Commit messages are immutable, so a
	// hover that reopens the same card never refetches.
	const message = workspaceTrpc.git.getCommitMessage.useQuery(
		{ workspaceId, commitHash: commit.hash },
		{ enabled: open, staleTime: Number.POSITIVE_INFINITY },
	);
	const subject = message.data?.subject ?? commit.message;
	const body = message.data?.body ?? "";

	return (
		<Tooltip open={open} onOpenChange={setOpen} delayDuration={400}>
			<TooltipTrigger asChild>
				<div className="flex min-w-0 flex-1 items-start justify-between gap-2">
					<div className="min-w-0 flex-1 overflow-hidden">
						<div
							className={wrap ? "text-sm wrap-break-word" : "truncate text-sm"}
						>
							{commit.message}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							{commit.shortHash} · {commit.author} · {timeAgo(commit.date)}
						</div>
					</div>
					{isSelected && <Check className="mt-0.5 size-3.5 shrink-0" />}
				</div>
			</TooltipTrigger>
			{/* The arrow points back at the hovered row, which matters in a list
			    this dense. Only the message scrolls: bodies are unbounded, and a
			    long one would otherwise grow the card past the window — the
			    arrow and the hash line have to stay put and visible.
			    The card is wide enough for a conventionally wrapped body (~72
			    columns) so the message is not re-wrapped into a ragged column
			    on top of the author's own line breaks. */}
			<TooltipContent
				side="left"
				align="start"
				showArrow
				collisionPadding={8}
				className="w-[26rem] max-w-[calc(100vw-6rem)] p-0 text-wrap"
			>
				<div className="max-h-64 overflow-y-auto px-2.5 py-2">
					<div className="font-medium text-foreground wrap-break-word">
						{subject}
					</div>
					{body && (
						<div className="mt-1.5 cursor-text select-text whitespace-pre-wrap font-normal leading-relaxed wrap-break-word">
							{body}
						</div>
					)}
				</div>
				<div className="border-border border-t px-2.5 py-1.5 font-normal text-[11px] text-muted-foreground/70">
					{commit.shortHash} · {commit.author} · {timeAgo(commit.date)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
