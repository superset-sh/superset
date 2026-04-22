import { cn } from "@superset/ui/utils";
import {
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
} from "lucide-react";
import type { DashboardSidebarWorkspacePullRequest } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";

interface PullRequestStatusIconProps {
	pr: DashboardSidebarWorkspacePullRequest;
	className?: string;
}

export function PullRequestStatusIcon({
	pr,
	className,
}: PullRequestStatusIconProps) {
	const baseClass = cn("size-4", className);
	const strokeWidth = 1.75;

	if (pr.state === "merged") {
		return (
			<GitMerge
				className={cn(baseClass, "text-violet-400/80")}
				strokeWidth={strokeWidth}
			/>
		);
	}
	if (pr.state === "closed") {
		return (
			<GitPullRequestClosed
				className={cn(baseClass, "text-rose-400/70")}
				strokeWidth={strokeWidth}
			/>
		);
	}
	if (pr.state === "draft") {
		return (
			<GitPullRequestDraft
				className={cn(baseClass, "text-muted-foreground/70")}
				strokeWidth={strokeWidth}
			/>
		);
	}
	// Open PR color by review decision:
	// - approved          → bright emerald (good to go)
	// - changes_requested → amber (needs author attention)
	// - pending           → sky blue (waiting on reviewers)
	// - null (no review)  → soft emerald (open, fresh)
	const openColor =
		pr.reviewDecision === "approved"
			? "text-emerald-400/80"
			: pr.reviewDecision === "changes_requested"
				? "text-amber-400/80"
				: pr.reviewDecision === "pending"
					? "text-sky-400/70"
					: "text-emerald-400/70";
	return (
		<GitPullRequest
			className={cn(baseClass, openColor)}
			strokeWidth={strokeWidth}
		/>
	);
}
