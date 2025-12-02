import { Button } from "@superset/ui/button";
import {
	Check,
	ChevronDown,
	ChevronRight,
	LoaderCircle,
	Minus,
	TriangleAlert,
	X,
} from "lucide-react";
import type { CheckItem } from "main/lib/db/schemas";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { trpc } from "renderer/lib/trpc";

interface WorkspaceHoverCardContentProps {
	workspaceId: string;
}

export function WorkspaceHoverCardContent({
	workspaceId,
}: WorkspaceHoverCardContentProps) {
	const { data: worktreeInfo } = trpc.workspaces.getWorktreeInfo.useQuery(
		{ workspaceId },
		{ enabled: !!workspaceId },
	);

	const { data: githubStatus, isLoading: isLoadingGithub } =
		trpc.workspaces.getGitHubStatus.useQuery(
			{ workspaceId },
			{ enabled: !!workspaceId },
		);

	const pr = githubStatus?.pr;
	const needsRebase = worktreeInfo?.gitStatus?.needsRebase;

	return (
		<div className="space-y-3">
			{/* Header: Worktree name + age */}
			{worktreeInfo?.worktreeName && (
				<div className="flex items-center justify-between gap-3">
					<code className="text-sm font-medium font-mono truncate">
						{worktreeInfo.worktreeName}
					</code>
					{worktreeInfo?.createdAt && (
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{formatRelativeTime(worktreeInfo.createdAt)}
						</span>
					)}
				</div>
			)}

			{/* Needs Rebase Warning */}
			{needsRebase && (
				<div className="flex items-center gap-2 text-amber-500 text-xs bg-amber-500/10 px-2 py-1.5 rounded-md">
					<TriangleAlert className="size-3.5 shrink-0" />
					<span>Behind main, needs rebase</span>
				</div>
			)}

			{/* PR Section */}
			{isLoadingGithub ? (
				<div className="flex items-center gap-2 text-muted-foreground pt-2 border-t border-border">
					<LoaderCircle className="size-3 animate-spin" />
					<span className="text-xs">Loading PR...</span>
				</div>
			) : pr ? (
				<div className="pt-2 border-t border-border space-y-2">
					{/* PR Header: Number + Status + Diff Stats */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground">
								#{pr.number}
							</span>
							<PRStatusBadge state={pr.state} />
						</div>
						<div className="flex items-center gap-1.5 text-xs font-mono">
							<span className="text-emerald-500">+{pr.additions}</span>
							<span className="text-destructive-foreground">
								-{pr.deletions}
							</span>
						</div>
					</div>

					{/* PR Title */}
					<p className="text-xs leading-relaxed line-clamp-2">{pr.title}</p>

					{/* Checks & Review - only for open PRs */}
					{pr.state === "open" && (
						<div className="space-y-2 pt-1">
							<div className="flex items-center gap-2 text-xs">
								<ChecksSummary checks={pr.checks} status={pr.checksStatus} />
								<span className="text-muted-foreground">·</span>
								<ReviewStatus status={pr.reviewDecision} />
							</div>
							{pr.checks.length > 0 && <ChecksList checks={pr.checks} />}
						</div>
					)}

					{/* View on GitHub button */}
					<Button
						variant="outline"
						size="sm"
						className="w-full mt-1 h-7 text-xs gap-1.5"
						asChild
					>
						<a href={pr.url} target="_blank" rel="noopener noreferrer">
							<FaGithub className="size-3" />
							View on GitHub
						</a>
					</Button>
				</div>
			) : githubStatus ? (
				<div className="text-xs text-muted-foreground pt-2 border-t border-border">
					No PR for this branch
				</div>
			) : null}
		</div>
	);
}

function PRStatusBadge({
	state,
}: {
	state: "open" | "draft" | "merged" | "closed";
}) {
	const styles = {
		open: "bg-emerald-500/15 text-emerald-500",
		draft: "bg-muted text-muted-foreground",
		merged: "bg-violet-500/15 text-violet-500",
		closed: "bg-destructive/15 text-destructive-foreground",
	};

	const labels = {
		open: "Open",
		draft: "Draft",
		merged: "Merged",
		closed: "Closed",
	};

	return (
		<span
			className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${styles[state]}`}
		>
			{labels[state]}
		</span>
	);
}

function ChecksSummary({
	checks,
	status,
}: {
	checks: CheckItem[];
	status: "success" | "failure" | "pending" | "none";
}) {
	if (status === "none") return null;

	const passing = checks.filter((c) => c.status === "success").length;
	const total = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	).length;

	const config = {
		success: {
			icon: Check,
			className: "text-emerald-500",
		},
		failure: {
			icon: X,
			className: "text-destructive-foreground",
		},
		pending: {
			icon: LoaderCircle,
			className: "text-amber-500",
		},
	};

	const { icon: Icon, className } = config[status];
	const label = total > 0 ? `${passing}/${total} checks` : "Checks";

	return (
		<span className={`flex items-center gap-1 ${className}`}>
			<Icon
				className={`size-3 ${status === "pending" ? "animate-spin" : ""}`}
			/>
			<span>{label}</span>
		</span>
	);
}

function ChecksList({ checks }: { checks: CheckItem[] }) {
	const [expanded, setExpanded] = useState(false);

	// Filter out skipped/cancelled for display count, but show all when expanded
	const relevantChecks = checks.filter(
		(c) => c.status !== "skipped" && c.status !== "cancelled",
	);

	if (relevantChecks.length === 0) return null;

	return (
		<div className="text-xs">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
			>
				{expanded ? (
					<ChevronDown className="size-3" />
				) : (
					<ChevronRight className="size-3" />
				)}
				<span>{expanded ? "Hide checks" : "Show checks"}</span>
			</button>

			{expanded && (
				<div className="mt-1.5 space-y-1 pl-1">
					{relevantChecks.map((check) => (
						<CheckItemRow key={check.name} check={check} />
					))}
				</div>
			)}
		</div>
	);
}

function CheckItemRow({ check }: { check: CheckItem }) {
	const statusConfig = {
		success: { icon: Check, className: "text-emerald-500" },
		failure: { icon: X, className: "text-destructive-foreground" },
		pending: { icon: LoaderCircle, className: "text-amber-500" },
		skipped: { icon: Minus, className: "text-muted-foreground" },
		cancelled: { icon: Minus, className: "text-muted-foreground" },
	};

	const { icon: Icon, className } = statusConfig[check.status];

	const content = (
		<span className="flex items-center gap-1.5 py-0.5">
			<Icon
				className={`size-3 shrink-0 ${className} ${check.status === "pending" ? "animate-spin" : ""}`}
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
				className="block text-muted-foreground hover:text-foreground transition-colors"
			>
				{content}
			</a>
		);
	}

	return <div className="text-muted-foreground">{content}</div>;
}

function ReviewStatus({
	status,
}: {
	status: "approved" | "changes_requested" | "pending";
}) {
	const config = {
		approved: { label: "Approved", className: "text-emerald-500" },
		changes_requested: {
			label: "Changes requested",
			className: "text-destructive-foreground",
		},
		pending: { label: "Review pending", className: "text-muted-foreground" },
	};

	const { label, className } = config[status];

	return <span className={className}>{label}</span>;
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days} day${days === 1 ? "" : "s"} ago`;
	}
	if (hours > 0) {
		return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	}
	if (minutes > 0) {
		return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	}
	return "Just now";
}
