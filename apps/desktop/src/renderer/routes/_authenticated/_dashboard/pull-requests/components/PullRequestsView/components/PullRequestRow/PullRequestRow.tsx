import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import {
	type PullRequestCheck,
	summarizePullRequestChecks,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-checks";
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
	checks: PullRequestCheck[];
	additions: number | null;
	deletions: number | null;
	headRefName: string | null;
}

const STATUS_DOT_STYLES = {
	success: "bg-emerald-500",
	failure: "bg-red-500",
	pending: "bg-amber-500",
	none: "bg-transparent",
} as const;

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
	const checksSummary = summarizePullRequestChecks(pr.checks);
	const hasDiffStat = pr.additions != null || pr.deletions != null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: row is a composite list item, not a native control
		<div
			className={cn(
				"flex cursor-pointer items-start gap-2.5 border-b border-border/50 px-4 py-2.5 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
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
			<div className="relative mt-0.5 shrink-0">
				<PRIcon state={state} className="size-4" />
				{checksSummary.status !== "none" && (
					<span
						className={cn(
							"absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-background",
							STATUS_DOT_STYLES[checksSummary.status],
						)}
					/>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-start gap-2">
					<span className="min-w-0 flex-1 truncate text-sm font-medium">
						{pr.title}
					</span>
					<div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
						{hasDiffStat && (
							<span className="tabular-nums">
								<span className="text-emerald-600 dark:text-emerald-400">
									+{pr.additions ?? 0}
								</span>{" "}
								<span className="text-red-600 dark:text-red-400">
									-{pr.deletions ?? 0}
								</span>
							</span>
						)}
						{pr.updatedAt && (
							<span>
								{formatRelativeTime(new Date(pr.updatedAt).getTime())}
							</span>
						)}
					</div>
				</div>
				<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					{pr.authorLogin && (
						<Avatar className="size-4 rounded-sm">
							<AvatarImage
								src={`https://github.com/${pr.authorLogin}.png?size=32`}
								alt={pr.authorLogin}
							/>
							<AvatarFallback className="rounded-sm text-[8px]">
								{pr.authorLogin.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					)}
					{repoSlug && (
						<span className="min-w-0 shrink-0 truncate">{repoSlug}</span>
					)}
					{pr.headRefName && (
						<>
							<span className="shrink-0">·</span>
							<span className="min-w-0 truncate font-mono">
								{pr.headRefName}
							</span>
						</>
					)}
					<span className="shrink-0">·</span>
					<span className="shrink-0 tabular-nums">#{pr.prNumber}</span>
				</div>
			</div>
		</div>
	);
}
