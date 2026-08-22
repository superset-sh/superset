import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { PullRequestChecksSummary } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSummary";
import type { PullRequestCheck } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-checks";
import {
	normalizePRState,
	PRIcon,
} from "renderer/screens/main/components/PRIcon";

export interface PullRequestRowData {
	projectId: string;
	prNumber: number;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	updatedAt: string | null;
	additions: number | null;
	deletions: number | null;
	headRefName: string | null;
	checks: PullRequestCheck[];
}

interface PullRequestRowProps {
	pr: PullRequestRowData;
	repoSlug: string | undefined;
	isSelected: boolean;
	onClick: () => void;
}

export function PullRequestRow({
	pr,
	repoSlug,
	isSelected,
	onClick,
}: PullRequestRowProps) {
	const state = normalizePRState(pr.state, pr.isDraft);
	const hasDiffStat = pr.additions != null || pr.deletions != null;
	const parsedUpdatedAt = pr.updatedAt ? new Date(pr.updatedAt).getTime() : NaN;
	const updatedAtMs = Number.isNaN(parsedUpdatedAt) ? null : parsedUpdatedAt;

	return (
		// biome-ignore lint/a11y/useSemanticElements: row is a composite list item, not a native control
		<div
			className={cn(
				"flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
				isSelected && "bg-accent",
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			role="button"
			tabIndex={0}
			aria-current={isSelected ? "true" : undefined}
		>
			<PRIcon state={state} className="size-4 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-[13px] font-medium text-foreground">
					{pr.title}
				</span>
				<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
					{pr.authorLogin && (
						<div className="flex shrink-0 items-center gap-1">
							<Avatar className="size-4 rounded-sm">
								<AvatarImage
									src={`https://github.com/${pr.authorLogin}.png?size=32`}
									alt={pr.authorLogin}
								/>
								<AvatarFallback className="rounded-sm text-[8px]">
									{pr.authorLogin.slice(0, 1).toUpperCase()}
								</AvatarFallback>
							</Avatar>
						</div>
					)}
					{repoSlug && (
						<span className="min-w-0 shrink-0 truncate text-[10px]">
							{repoSlug}
						</span>
					)}
					<span className="shrink-0 text-[10px] tabular-nums">
						#{pr.prNumber}
					</span>
					{pr.headRefName && (
						<>
							<span className="shrink-0 text-[11px]">·</span>
							<span className="min-w-0 truncate font-mono text-[11px]">
								{pr.headRefName}
							</span>
						</>
					)}
				</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
				{updatedAtMs != null && <span>{formatRelativeTime(updatedAtMs)}</span>}
				<div className="flex items-center gap-2">
					<PullRequestChecksSummary checks={pr.checks} />
					{hasDiffStat && (
						<span className="flex items-center gap-1 tabular-nums">
							<span className="text-emerald-600 dark:text-emerald-400">
								+{pr.additions ?? 0}
							</span>
							<span className="text-red-600 dark:text-red-400">
								-{pr.deletions ?? 0}
							</span>
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
