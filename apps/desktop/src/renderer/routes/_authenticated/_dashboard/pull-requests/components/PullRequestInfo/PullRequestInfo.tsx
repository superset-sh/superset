import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import {
	ArrowUpRight,
	ChevronDown,
	ChevronRight,
	CircleCheck,
	CircleX,
	ListChecks,
	LoaderCircle,
	MessageSquareText,
	Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { normalizePRState } from "renderer/screens/main/components/PRIcon";
import type {
	PullRequestDetail,
	PullRequestDetailActor,
} from "../../hooks/usePullRequestDetail";
import { describePullRequestMergeStatus } from "../../utils/describePullRequestMergeStatus";
import { PullRequestStateGlyph } from "../PullRequestStateGlyph";
import {
	type PullRequestCheck,
	summarizePullRequestChecks,
} from "../pull-request-checks";
import {
	PR_GREEN_FILL_CLASS_NAME,
	PR_RED_FILL_CLASS_NAME,
} from "../pull-request-colors";

export type PullRequestInfoVariant = "column" | "rows";

/** Checks listed before "View more". */
const CHECKS_VISIBLE_LIMIT = 6;

interface SectionProps {
	variant: PullRequestInfoVariant;
	label: string;
	icon?: ReactNode;
	/** Sits at the label's end in the column (the "Request" chip). */
	action?: ReactNode;
	children: ReactNode;
}

function InfoSection({ variant, label, icon, action, children }: SectionProps) {
	if (variant === "rows") {
		return (
			<div className="flex items-start gap-3 py-1.5 text-xs">
				<span className="flex h-6 w-24 shrink-0 items-center gap-2 text-muted-foreground @max-[30rem]/detail:w-20">
					{icon}
					{label}
				</span>
				<div className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-2 text-foreground">
					{children}
				</div>
			</div>
		);
	}
	return (
		<section className="flex flex-col gap-2" aria-label={label}>
			<div className="flex h-6 items-center justify-between gap-2">
				<h2 className="m-0 text-xs font-normal text-muted-foreground">
					{label}
				</h2>
				{action}
			</div>
			<div className="flex min-w-0 flex-col gap-2 text-xs">{children}</div>
		</section>
	);
}

function ActorLabel({ actor }: { actor: PullRequestDetailActor }) {
	return (
		<span
			className="flex min-w-0 max-w-full items-center gap-1.5"
			title={actor.login}
		>
			<Avatar className="size-4 rounded-full ring-1 ring-border/50">
				<AvatarImage
					src={`https://github.com/${actor.login}.png?size=64`}
					alt=""
				/>
				<AvatarFallback className="text-[8px]">
					{actor.login.slice(0, 1).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<span className="truncate">{actor.name ?? actor.login}</span>
		</span>
	);
}

function MergeStatusSection({ data }: { data: PullRequestDetail }) {
	const { t } = useLingui();
	const status = describePullRequestMergeStatus({
		state: data.state,
		isDraft: data.isDraft,
		mergeability: data.mergeability,
		baseBranch: data.base.ref,
	});
	const label =
		status.kind === "merged"
			? t({ message: "Merged" })
			: status.kind === "closed"
				? t({ message: "Closed" })
				: status.kind === "draft"
					? t({ message: "Draft" })
					: status.kind === "conflicting"
						? t({ message: `Conflicts with ${status.baseBranch}` })
						: status.kind === "mergeable"
							? t({ message: "Can merge without conflicts" })
							: t({ message: "Merge status unknown" });
	return (
		<InfoSection variant="column" label={t({ message: "Merge status" })}>
			<span className="flex items-center gap-2">
				{status.tone === "success" ? (
					<CircleCheck
						className={cn(
							"size-4 shrink-0 text-background",
							PR_GREEN_FILL_CLASS_NAME,
						)}
					/>
				) : status.tone === "conflict" ? (
					<PullRequestStateGlyph state="conflicting" className="size-4" />
				) : (
					<PullRequestStateGlyph
						state={normalizePRState(data.state, data.isDraft)}
						className="size-4"
					/>
				)}
				<span
					className={
						status.tone === "muted" ? "text-muted-foreground" : undefined
					}
				>
					{label}
				</span>
			</span>
		</InfoSection>
	);
}

function CommentsSection({
	variant,
	count,
}: {
	variant: PullRequestInfoVariant;
	count: number;
}) {
	const { t } = useLingui();
	return (
		<InfoSection
			variant={variant}
			label={t({ message: "Comments" })}
			icon={<MessageSquareText strokeWidth={1.75} className="size-4" />}
		>
			<span className={count === 0 ? "text-muted-foreground" : undefined}>
				{count === 0 ? (
					<Trans>No comments</Trans>
				) : (
					<Plural value={count} one="# comment" other="# comments" />
				)}
			</span>
		</InfoSection>
	);
}

function ReviewsSection({
	variant,
	data,
}: {
	variant: PullRequestInfoVariant;
	data: PullRequestDetail;
}) {
	const { t } = useLingui();
	const reviewers = data.reviewers ?? [];
	const decision =
		data.reviewDecision === "approved" ? (
			<Trans>Approved</Trans>
		) : data.reviewDecision === "changes_requested" ? (
			<Trans>Changes requested</Trans>
		) : null;
	const hasReviews = reviewers.length > 0 || decision !== null;
	// GitHub has no request-review action here; its page is where reviewers are picked.
	const request =
		data.state === "open" ? (
			<Button
				variant="secondary"
				size="xs"
				className="h-6 gap-0.5 rounded-full pl-2.5 pr-1.5 font-normal"
				asChild
			>
				<a href={data.url} target="_blank" rel="noopener noreferrer">
					<Trans>Request</Trans>
					<ChevronRight aria-hidden className="size-3.5" />
				</a>
			</Button>
		) : null;
	return (
		<InfoSection
			variant={variant}
			label={t({ message: "Reviews" })}
			icon={<Users strokeWidth={1.75} className="size-4" />}
			action={variant === "column" ? request : undefined}
		>
			{hasReviews ? (
				<>
					{decision ? <span>{decision}</span> : null}
					{reviewers.map((actor) => (
						<ActorLabel key={actor.login} actor={actor} />
					))}
				</>
			) : (
				<span className="text-muted-foreground">
					<Trans>No reviews</Trans>
				</span>
			)}
			{variant === "rows" ? request : null}
		</InfoSection>
	);
}

function CheckStatusIcon({ status }: { status: PullRequestCheck["status"] }) {
	switch (status) {
		case "success":
			return (
				<CircleCheck
					className={cn(
						"size-4 shrink-0 text-background",
						PR_GREEN_FILL_CLASS_NAME,
					)}
				/>
			);
		case "failure":
		case "cancelled":
			return (
				<CircleX
					className={cn(
						"size-4 shrink-0 text-background",
						PR_RED_FILL_CLASS_NAME,
					)}
				/>
			);
		case "pending":
			return (
				<LoaderCircle className="size-4 shrink-0 animate-spin text-amber-500 motion-reduce:animate-none" />
			);
		default:
			return (
				<span className="flex size-4 shrink-0 items-center justify-center">
					<span className="size-3.5 rounded-full border border-dashed border-current opacity-50" />
				</span>
			);
	}
}

function CheckRows({ checks }: { checks: PullRequestCheck[] }) {
	const { t } = useLingui();
	const [showAll, setShowAll] = useState(false);
	const statusLabels: Record<PullRequestCheck["status"], string> = {
		success: t({ message: "Passed" }),
		failure: t({ message: "Failed" }),
		pending: t({ message: "In progress" }),
		skipped: t({ message: "Skipped" }),
		cancelled: t({ message: "Cancelled" }),
	};
	const visible = showAll ? checks : checks.slice(0, CHECKS_VISIBLE_LIMIT);
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			{visible.map((check, index) => {
				const content = (
					<>
						<CheckStatusIcon status={check.status} />
						<span className="sr-only">{statusLabels[check.status]}</span>
						<span className="min-w-0 flex-1 truncate">{check.name}</span>
						{check.url ? (
							<ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/check:opacity-100" />
						) : null}
					</>
				);
				const rowClassName =
					"group/check -mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left";
				return check.url ? (
					<a
						key={`${check.name}-${index}`}
						href={check.url}
						target="_blank"
						rel="noopener noreferrer"
						className={cn(rowClassName, "hover:bg-muted/50")}
					>
						{content}
					</a>
				) : (
					<div key={`${check.name}-${index}`} className={rowClassName}>
						{content}
					</div>
				);
			})}
			{checks.length > CHECKS_VISIBLE_LIMIT ? (
				<button
					type="button"
					onClick={() => setShowAll((current) => !current)}
					className="w-fit rounded-md py-1 text-left text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					{showAll ? <Trans>Show fewer</Trans> : <Trans>View more</Trans>}
				</button>
			) : null}
		</div>
	);
}

function ChecksSection({
	variant,
	checks,
}: {
	variant: PullRequestInfoVariant;
	checks: PullRequestCheck[];
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const summary = summarizePullRequestChecks(checks);
	if (variant === "column") {
		return (
			<InfoSection variant="column" label={t({ message: "Checks" })}>
				{checks.length === 0 ? (
					<span className="text-muted-foreground">
						<Trans>No checks</Trans>
					</span>
				) : (
					<CheckRows checks={checks} />
				)}
			</InfoSection>
		);
	}
	const brief =
		summary.status === "none" ? (
			<Trans>No checks</Trans>
		) : summary.status === "success" ? (
			<Plural value={summary.passing} one="# successful" other="# successful" />
		) : summary.status === "failure" ? (
			<Plural value={summary.failing} one="# failing" other="# failing" />
		) : (
			<Plural value={summary.pending} one="# pending" other="# pending" />
		);
	return (
		<InfoSection
			variant="rows"
			label={t({ message: "Checks" })}
			icon={<ListChecks strokeWidth={1.75} className="size-4" />}
		>
			{checks.length === 0 ? (
				<span className="text-muted-foreground">
					<Trans>No checks</Trans>
				</span>
			) : (
				<Collapsible
					open={open}
					onOpenChange={setOpen}
					className="flex w-full min-w-0 flex-col"
				>
					<CollapsibleTrigger className="flex w-fit items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
						{summary.status === "success" ? (
							<CircleCheck
								className={cn(
									"size-4 text-background",
									PR_GREEN_FILL_CLASS_NAME,
								)}
							/>
						) : null}
						{brief}
						<ChevronDown
							className={cn(
								"size-3.5 text-muted-foreground transition-transform",
								open && "rotate-180",
							)}
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="pt-1.5">
							<CheckRows checks={checks} />
						</div>
					</CollapsibleContent>
				</Collapsible>
			)}
		</InfoSection>
	);
}

interface PullRequestInfoProps {
	data: PullRequestDetail;
	variant: PullRequestInfoVariant;
}

/**
 * The status facts of a pull request in two shapes of the same data: a
 * right-hand column of titled sections (wide panes) and compact label/value
 * rows under the header (narrow panes).
 */
export function PullRequestInfo({ data, variant }: PullRequestInfoProps) {
	return (
		<div
			className={cn(
				variant === "column" ? "flex flex-col gap-7" : "flex flex-col",
			)}
			data-info-variant={variant}
		>
			{variant === "column" ? <MergeStatusSection data={data} /> : null}
			{data.comments ? (
				<CommentsSection variant={variant} count={data.comments.length} />
			) : null}
			<ReviewsSection variant={variant} data={data} />
			<ChecksSection variant={variant} checks={data.checks} />
		</div>
	);
}
