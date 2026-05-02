import { Button } from "@superset/ui/button";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import { LuGitBranch } from "react-icons/lu";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { ChecksList } from "./components/ChecksList";
import { ChecksSummary } from "./components/ChecksSummary";
import { PrStateBadge } from "./components/PrStateBadge";
import { ReviewStatusBadge } from "./components/ReviewStatusBadge";

interface V2WorkspacePrHoverCardContentProps {
	pr: V2WorkspacePrSummary;
	branch: string;
}

export function V2WorkspacePrHoverCardContent({
	pr,
	branch,
}: V2WorkspacePrHoverCardContentProps) {
	const showChecks =
		(pr.state === "open" || pr.state === "draft") && pr.checksStatus !== "none";

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

				{showChecks ? (
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
