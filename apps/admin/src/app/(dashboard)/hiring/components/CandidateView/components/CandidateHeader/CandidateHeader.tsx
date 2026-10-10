"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { type HiringOutcome, hiringStageValues } from "@superset/db/enums";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import type { IconType } from "react-icons";
import {
	LuBriefcase,
	LuChevronDown,
	LuChevronUp,
	LuGithub,
	LuGlobe,
	LuLinkedin,
	LuMail,
	LuTwitter,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

import { useHiringLabels } from "../../../../hooks/useHiringLabels";
import { useInvalidateHiring } from "../../../../hooks/useInvalidateHiring";
import { isoDateFromToday } from "../../../../utils/isoDate";
import { safeHref } from "../../../../utils/safeHref";

type CandidateDetail = RouterOutputs["hiring"]["get"];
type Application = CandidateDetail["applications"][number];

const NEXT_TOUCH_DAYS = 7;
const CLOSE_OUTCOMES = [
	"hired",
	"rejected",
	"withdrew",
	"not_looking",
] as const satisfies HiringOutcome[];

export interface CandidatePosition {
	index: number;
	total: number;
}

interface CandidateHeaderProps {
	detail: CandidateDetail;
	application: Application | undefined;
	position?: CandidatePosition | null;
	onPrev?: () => void;
	onNext?: () => void;
}

export function CandidateHeader({
	detail,
	application,
	position,
	onPrev,
	onNext,
}: CandidateHeaderProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useHiringLabels();
	const { formatCompactRelativeTime } = useFormat();
	const invalidate = useInvalidateHiring();
	const onError = (error: { message: string }) => toast.error(error.message);
	const update = useMutation(
		trpc.hiring.updateApplication.mutationOptions({
			onSuccess: invalidate,
			onError,
		}),
	);
	const logTouch = useMutation(
		trpc.hiring.logTouch.mutationOptions({ onSuccess: invalidate, onError }),
	);

	const { candidate, supersetUser } = detail;
	const webLinks: [string | null, IconType, string][] = [
		[candidate.githubUrl, LuGithub, "GitHub"],
		[candidate.linkedinUrl, LuLinkedin, "LinkedIn"],
		[candidate.xUrl, LuTwitter, "X"],
		[candidate.siteUrl, LuGlobe, t({ message: "Website" })],
		[candidate.waasUrl, LuBriefcase, "Work at a Startup"],
	];
	const links: { href: string; icon: IconType; label: string }[] = [
		...(candidate.email
			? [
					{
						href: `mailto:${candidate.email}`,
						icon: LuMail,
						label: candidate.email,
					},
				]
			: []),
		...webLinks.flatMap(([url, icon, label]) => {
			const href = safeHref(url);
			return href ? [{ href, icon, label }] : [];
		}),
	];

	const isActive = application?.outcome === "active";
	const stageIndex = application
		? hiringStageValues.indexOf(application.stage)
		: -1;
	const nextStage = hiringStageValues[stageIndex + 1];
	const isPending = update.isPending || logTouch.isPending;
	const applicationId = application?.applicationId ?? "";
	const nextStageLabel = nextStage ? labels.stage[nextStage] : null;
	const lastContact = application?.lastContactedAt
		? formatCompactRelativeTime(new Date(application.lastContactedAt))
		: null;
	const current = position ? position.index + 1 : 0;
	const total = position?.total ?? 0;

	return (
		<header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
			<div className="min-w-0 space-y-2">
				<div className="flex flex-wrap items-center gap-3">
					<h2 className="truncate text-xl font-semibold">{candidate.name}</h2>
					<div className="text-muted-foreground flex items-center gap-1">
						{links.map(({ href, icon: Icon, label }) => (
							<a
								key={href}
								href={href}
								target="_blank"
								rel="noreferrer"
								title={label}
								aria-label={label}
								className="hover:text-foreground rounded p-1"
							>
								<Icon className="size-4" />
							</a>
						))}
					</div>
				</div>
				{(candidate.currentTitle || candidate.currentCompany) && (
					<p className="text-muted-foreground text-sm">
						{[candidate.currentTitle, candidate.currentCompany]
							.filter(Boolean)
							.join(" · ")}
					</p>
				)}
				<div className="flex flex-wrap items-center gap-1.5">
					{application && (
						<Badge variant="secondary">
							{application.roleTitle} · {labels.stage[application.stage]}
						</Badge>
					)}
					{application && !isActive && (
						<Badge
							variant={application.outcome === "hired" ? "default" : "outline"}
						>
							{labels.outcome[application.outcome]}
						</Badge>
					)}
					{candidate.source && (
						<Badge variant="outline">{labels.source[candidate.source]}</Badge>
					)}
					{lastContact && (
						<Badge variant="outline">
							<Trans>Last contact {lastContact}</Trans>
						</Badge>
					)}
					{supersetUser && (
						<Badge variant="outline">
							<Trans>Superset user · {supersetUser.email}</Trans>
						</Badge>
					)}
					{candidate.notionPageId && (
						<a
							href={`https://www.notion.so/${candidate.notionPageId.replaceAll("-", "")}`}
							target="_blank"
							rel="noreferrer"
							className="text-muted-foreground hover:text-foreground text-xs underline"
						>
							<Trans>Notion page</Trans>
						</a>
					)}
				</div>
			</div>

			<div className="flex items-center gap-2">
				{position && (
					<div className="text-muted-foreground flex items-center gap-1 text-xs tabular-nums">
						<Button
							size="icon"
							variant="ghost"
							className="size-7"
							disabled={!onPrev}
							onClick={onPrev}
							aria-label={t({ message: "Previous candidate" })}
						>
							<LuChevronUp className="size-4" />
						</Button>
						<Button
							size="icon"
							variant="ghost"
							className="size-7"
							disabled={!onNext}
							onClick={onNext}
							aria-label={t({ message: "Next candidate" })}
						>
							<LuChevronDown className="size-4" />
						</Button>
						<span>
							<Trans>
								{current} of {total}
							</Trans>
						</span>
					</div>
				)}
				{application && isActive && (
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={isPending}
							onClick={() =>
								logTouch.mutate({
									applicationId,
									nextFollowUpOn: isoDateFromToday(NEXT_TOUCH_DAYS),
								})
							}
						>
							<Trans>Touched</Trans>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" disabled={isPending}>
									<Trans>Close</Trans>
									<LuChevronDown className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{CLOSE_OUTCOMES.map((outcome) => (
									<DropdownMenuItem
										key={outcome}
										onSelect={() => update.mutate({ applicationId, outcome })}
									>
										{labels.outcome[outcome]}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							size="sm"
							disabled={isPending}
							onClick={() =>
								update.mutate(
									nextStage
										? { applicationId, stage: nextStage }
										: { applicationId, outcome: "hired" },
								)
							}
						>
							{nextStageLabel ? (
								<Trans>Move to {nextStageLabel}</Trans>
							) : (
								<Trans>Mark hired</Trans>
							)}
						</Button>
					</>
				)}
				{application && !isActive && (
					<Button
						variant="outline"
						size="sm"
						disabled={isPending}
						onClick={() => update.mutate({ applicationId, outcome: "active" })}
					>
						<Trans>Reopen</Trans>
					</Button>
				)}
			</div>
		</header>
	);
}
