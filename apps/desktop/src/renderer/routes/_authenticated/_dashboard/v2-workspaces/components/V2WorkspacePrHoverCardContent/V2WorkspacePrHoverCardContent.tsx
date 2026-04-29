import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuGitBranch,
	LuLoaderCircle,
	LuMinus,
	LuX,
} from "react-icons/lu";
import type {
	V2WorkspacePrChecksStatus,
	V2WorkspacePrReviewDecision,
	V2WorkspacePrState,
	V2WorkspacePrSummary,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

interface V2WorkspacePrHoverCardContentProps {
	pr: V2WorkspacePrSummary;
	branch: string;
}

export function V2WorkspacePrHoverCardContent({
	pr,
	branch,
}: V2WorkspacePrHoverCardContentProps) {
	return (
		<div className="space-y-3">
			<div className="space-y-0.5">
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					Branch
				</span>
				<div className="flex items-center gap-1.5 text-sm">
					<LuGitBranch className="size-3 shrink-0 text-muted-foreground" />
					<code className="block min-w-0 flex-1 break-all font-mono text-xs">
						{branch}
					</code>
				</div>
			</div>

			<div className="space-y-2 border-t border-border pt-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							#{pr.prNumber}
						</span>
						<PrStateBadge state={pr.state} />
						{pr.state === "open" || pr.state === "draft" ? (
							<ReviewStatusBadge status={pr.reviewDecision} />
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
						<span className="text-emerald-500">+{pr.additions}</span>
						<span className="text-destructive-foreground">-{pr.deletions}</span>
					</div>
				</div>

				<p className="line-clamp-2 text-xs leading-relaxed">{pr.title}</p>

				<span className="block text-[10px] text-muted-foreground">
					Updated {formatDistanceToNow(pr.updatedAt, { addSuffix: true })}
				</span>

				{(pr.state === "open" || pr.state === "draft") &&
				pr.checksStatus !== "none" ? (
					<div className="space-y-2 pt-1">
						<div className="flex items-center gap-2 text-xs">
							<ChecksSummary checks={pr.checks} status={pr.checksStatus} />
						</div>
						{pr.checks.length > 0 ? <ChecksList checks={pr.checks} /> : null}
					</div>
				) : null}

				<Button
					variant="outline"
					size="sm"
					className="mt-1 h-7 w-full gap-1.5 text-xs"
					asChild
				>
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(event) => event.stopPropagation()}
					>
						<FaGithub className="size-3" />
						View on GitHub
					</a>
				</Button>
			</div>
		</div>
	);
}

const STATE_BADGE_STYLES: Record<V2WorkspacePrState, string> = {
	open: "bg-emerald-500/15 text-emerald-500",
	draft: "bg-muted text-muted-foreground",
	merged: "bg-violet-500/15 text-violet-500",
	closed: "bg-destructive/15 text-destructive-foreground",
};

const STATE_BADGE_LABELS: Record<V2WorkspacePrState, string> = {
	open: "Open",
	draft: "Draft",
	merged: "Merged",
	closed: "Closed",
};

function PrStateBadge({ state }: { state: V2WorkspacePrState }) {
	return (
		<span
			className={cn(
				"shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
				STATE_BADGE_STYLES[state],
			)}
		>
			{STATE_BADGE_LABELS[state]}
		</span>
	);
}

const REVIEW_BADGE_STYLES: Record<V2WorkspacePrReviewDecision, string> = {
	approved: "bg-emerald-500/15 text-emerald-500",
	changes_requested: "bg-destructive/15 text-destructive-foreground",
	pending: "bg-amber-500/15 text-amber-500",
};

const REVIEW_BADGE_LABELS: Record<V2WorkspacePrReviewDecision, string> = {
	approved: "Approved",
	changes_requested: "Changes requested",
	pending: "Review pending",
};

function ReviewStatusBadge({
	status,
}: {
	status: V2WorkspacePrReviewDecision;
}) {
	return (
		<span
			className={cn(
				"max-w-[200px] shrink-0 truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium",
				REVIEW_BADGE_STYLES[status],
			)}
		>
			{REVIEW_BADGE_LABELS[status]}
		</span>
	);
}

interface ChecksSummaryProps {
	checks: V2WorkspacePrSummary["checks"];
	status: V2WorkspacePrChecksStatus;
}

function ChecksSummary({ checks, status }: ChecksSummaryProps) {
	if (status === "none") return null;

	const passing = checks.filter((c) => c.status === "success").length;
	const total = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	).length;

	const config = {
		success: { Icon: LuCheck, className: "text-emerald-500" },
		failure: { Icon: LuX, className: "text-destructive-foreground" },
		pending: { Icon: LuLoaderCircle, className: "text-amber-500" },
	} as const;

	const { Icon, className } = config[status];
	const label = total > 0 ? `${passing}/${total} checks` : "Checks";

	return (
		<span className={cn("flex items-center gap-1", className)}>
			<Icon className={cn("size-3", status === "pending" && "animate-spin")} />
			<span>{label}</span>
		</span>
	);
}

interface ChecksListProps {
	checks: V2WorkspacePrSummary["checks"];
}

function ChecksList({ checks }: ChecksListProps) {
	const [expanded, setExpanded] = useState(false);

	const relevant = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	);
	if (relevant.length === 0) return null;

	return (
		<div className="text-xs">
			<button
				type="button"
				onClick={() => setExpanded((prev) => !prev)}
				className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			>
				{expanded ? (
					<LuChevronDown className="size-3" />
				) : (
					<LuChevronRight className="size-3" />
				)}
				<span>{expanded ? "Hide checks" : "Show checks"}</span>
			</button>

			{expanded ? (
				<div className="mt-1.5 space-y-1 pl-1">
					{relevant.map((check) => (
						<CheckRow key={check.name} check={check} />
					))}
				</div>
			) : null}
		</div>
	);
}

const CHECK_ROW_CONFIG: Record<
	V2WorkspacePrSummary["checks"][number]["status"],
	{ Icon: typeof LuCheck; className: string }
> = {
	success: { Icon: LuCheck, className: "text-emerald-500" },
	failure: { Icon: LuX, className: "text-destructive-foreground" },
	pending: { Icon: LuLoaderCircle, className: "text-amber-500" },
	skipped: { Icon: LuMinus, className: "text-muted-foreground" },
	cancelled: { Icon: LuMinus, className: "text-muted-foreground" },
};

function CheckRow({
	check,
}: {
	check: V2WorkspacePrSummary["checks"][number];
}) {
	const { Icon, className } = CHECK_ROW_CONFIG[check.status];
	const content = (
		<span className="flex items-center gap-1.5 py-0.5">
			<Icon
				className={cn(
					"size-3 shrink-0",
					className,
					check.status === "pending" && "animate-spin",
				)}
			/>
			<span className="truncate">{check.name}</span>
		</span>
	);

	if (check.url) {
		return (
			<a
				href={check.url}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(event) => event.stopPropagation()}
				className="block text-muted-foreground transition-colors hover:text-foreground"
			>
				{content}
			</a>
		);
	}

	return <div className="text-muted-foreground">{content}</div>;
}
