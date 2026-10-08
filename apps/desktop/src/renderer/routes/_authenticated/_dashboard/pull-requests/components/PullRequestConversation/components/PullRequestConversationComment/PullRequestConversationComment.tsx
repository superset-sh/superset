import { Trans } from "@lingui/react/macro";
import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { PullRequestDetailComment } from "../../../../hooks/usePullRequestDetail";
import {
	type PullRequestCommentSeverity,
	parseFindingComment,
} from "../../../../utils/parseFindingComment";
import { PullRequestMarkdown } from "../../../PullRequestMarkdown";

const SEVERITY_CLASS_NAME: Record<PullRequestCommentSeverity, string> = {
	High: "text-red-600 [.dark_&]:text-[#f87171]",
	Medium: "text-amber-600 [.dark_&]:text-[#fbbf24]",
	Low: "text-muted-foreground",
};

function SeverityLabel({ severity }: { severity: PullRequestCommentSeverity }) {
	switch (severity) {
		case "High":
			return <Trans>High severity</Trans>;
		case "Medium":
			return <Trans>Medium severity</Trans>;
		default:
			return <Trans>Low severity</Trans>;
	}
}

function ReviewStateLabel({ state }: { state: string | null }) {
	switch (state) {
		case "APPROVED":
			return <Trans>approved</Trans>;
		case "CHANGES_REQUESTED":
			return <Trans>requested changes</Trans>;
		case "COMMENTED":
			return <Trans>reviewed</Trans>;
		default:
			return null;
	}
}

interface PullRequestConversationCommentProps {
	comment: PullRequestDetailComment;
	prUrl: string;
	/** Long threads start older comments collapsed so the page doesn't render
	 *  dozens of markdown trees at once. */
	defaultOpen?: boolean;
}

/** One comment or review as a hairline-separated collapsible row. */
export function PullRequestConversationComment({
	comment,
	prUrl,
	defaultOpen = true,
}: PullRequestConversationCommentProps) {
	const [open, setOpen] = useState(defaultOpen);
	const finding = parseFindingComment(comment.body);
	const createdAt = new Date(comment.createdAt);
	const createdAtValid = !Number.isNaN(createdAt.getTime());
	const author = comment.author;
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="border-t border-border/50 first:border-t-0"
		>
			<CollapsibleTrigger className="flex w-full items-center gap-2 py-2.5 text-left">
				<span
					className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-foreground"
					title={author?.login}
				>
					<Avatar className="size-4 rounded-full ring-1 ring-border/50">
						<AvatarImage
							src={
								author
									? `https://github.com/${author.login}.png?size=64`
									: undefined
							}
							alt=""
						/>
						<AvatarFallback className="text-[8px]">
							{(author?.login ?? "?").slice(0, 1).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<span className="truncate">
						{author?.name ?? author?.login ?? "ghost"}
					</span>
					{comment.kind === "review" ? (
						<span className="shrink-0 font-normal text-muted-foreground">
							<ReviewStateLabel state={comment.reviewState} />
						</span>
					) : null}
				</span>
				{createdAtValid ? (
					<time
						dateTime={comment.createdAt}
						title={formatDateTime(createdAt)}
						className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
					>
						{formatRelativeTime(createdAt)}
					</time>
				) : null}
				<ChevronDown
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="pb-3">
					{finding ? (
						<div className="mb-2">
							<p className="text-sm font-semibold text-foreground">
								{finding.title}
							</p>
							<p
								className={cn(
									"text-xs font-medium",
									SEVERITY_CLASS_NAME[finding.severity],
								)}
							>
								<SeverityLabel severity={finding.severity} />
							</p>
						</div>
					) : null}
					{(finding ? finding.body : comment.body).trim() ? (
						<PullRequestMarkdown body={finding ? finding.body : comment.body} />
					) : (
						<p className="text-sm italic text-muted-foreground">
							<Trans>No review body.</Trans>
						</p>
					)}
					<div className="mt-2 flex justify-end">
						<a
							href={comment.url ?? prUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
						>
							<Trans>Reply</Trans>
						</a>
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
