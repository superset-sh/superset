import { cn } from "@superset/ui/utils";
import { formatDistanceToNow } from "date-fns";
import {
	LuArrowUpRight,
	LuCircleCheck,
	LuCircleDashed,
	LuCircleX,
	LuGitBranch,
} from "react-icons/lu";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import type { ChecksRollup } from "../../../../utils/computeChecksStatus";
import type { PullRequest } from "../../../../utils/getPRFlowState";

interface PRDetailCardProps {
	pr: PullRequest;
	checks: ChecksRollup;
	linkState: PRState;
}

/**
 * Rich popover that opens on hover/focus of the PR link. Surfaces the title,
 * branch info, CI/review summary, and last activity — everything that matters
 * about the PR without leaving the workspace. Wide enough (320px) to fit a
 * reasonable PR title on two lines.
 */
export function PRDetailCard({ pr, checks, linkState }: PRDetailCardProps) {
	const stateLabel = pr.isDraft
		? "Draft"
		: pr.state === "merged"
			? "Merged"
			: pr.state === "closed"
				? "Closed"
				: "Open";
	const statePillClass = stateLabelToPillClass(linkState);

	const updatedRelative = pr.updatedAt
		? formatDistanceToNow(new Date(pr.updatedAt), { addSuffix: true })
		: null;

	return (
		<div className="flex flex-col">
			<div className="flex items-start gap-2 px-3 pt-3 pb-2">
				<PRIcon state={linkState} className="mt-0.5 size-4 shrink-0" />
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
						{pr.title}
					</p>
					<div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<span className="font-mono">#{pr.number}</span>
						<span aria-hidden="true">·</span>
						<span
							className={cn(
								"rounded-sm px-1 py-px text-[10px] font-medium",
								statePillClass,
							)}
						>
							{stateLabel}
						</span>
					</div>
				</div>
			</div>

			{pr.headRefName && (
				<div className="flex items-center gap-1.5 px-3 pb-2 text-[11px] text-muted-foreground">
					<LuGitBranch
						aria-hidden="true"
						className="size-3 shrink-0 text-muted-foreground/70"
					/>
					<span className="truncate font-mono" title={pr.headRefName}>
						{pr.headRefName}
					</span>
				</div>
			)}

			<div className="flex flex-col gap-1.5 border-t border-border/60 px-3 py-2.5">
				<ChecksLine checks={checks} />
			</div>

			{updatedRelative && (
				<div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
					Updated {updatedRelative}
				</div>
			)}

			<a
				href={pr.url}
				target="_blank"
				rel="noopener noreferrer"
				className="group flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<span>View on GitHub</span>
				<LuArrowUpRight
					aria-hidden="true"
					className="size-3.5 text-muted-foreground/70 transition-transform group-hover:translate-x-px group-hover:-translate-y-px"
				/>
			</a>
		</div>
	);
}

function ChecksLine({ checks }: { checks: ChecksRollup }) {
	if (checks.overall === "none") {
		return <DetailLine icon={null} muted text="No checks reported" />;
	}
	const total = checks.relevantCount;
	if (checks.overall === "success") {
		return (
			<DetailLine
				icon={
					<LuCircleCheck
						aria-hidden="true"
						className="size-3.5 shrink-0 text-emerald-500"
					/>
				}
				text={`All ${total} ${total === 1 ? "check" : "checks"} passed`}
			/>
		);
	}
	if (checks.overall === "failure") {
		const failing = checks.failureCount;
		return (
			<DetailLine
				icon={
					<LuCircleX
						aria-hidden="true"
						className="size-3.5 shrink-0 text-rose-500"
					/>
				}
				text={`${failing} of ${total} ${total === 1 ? "check" : "checks"} failing`}
				accent="failure"
			/>
		);
	}
	const pending = checks.pendingCount;
	return (
		<DetailLine
			icon={
				<LuCircleDashed
					aria-hidden="true"
					className="size-3.5 shrink-0 text-amber-500"
				/>
			}
			text={`${pending} of ${total} ${total === 1 ? "check" : "checks"} running`}
			accent="pending"
		/>
	);
}

function DetailLine({
	icon,
	text,
	muted,
	accent,
}: {
	icon: React.ReactNode;
	text: string;
	muted?: boolean;
	accent?: "failure" | "pending";
}) {
	return (
		<div className="flex items-center gap-1.5 text-xs">
			{icon ?? <span className="size-3.5 shrink-0" aria-hidden="true" />}
			<span
				className={cn(
					"truncate",
					muted && "text-muted-foreground/60",
					!muted && !accent && "text-foreground",
					accent === "failure" && "text-rose-600 dark:text-rose-400",
					accent === "pending" && "text-amber-600 dark:text-amber-400",
				)}
			>
				{text}
			</span>
		</div>
	);
}

function stateLabelToPillClass(state: PRState): string {
	switch (state) {
		case "open":
			return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
		case "merged":
			return "bg-violet-500/10 text-violet-600 dark:text-violet-400";
		case "closed":
			return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
		case "draft":
			return "bg-muted text-muted-foreground";
	}
}
