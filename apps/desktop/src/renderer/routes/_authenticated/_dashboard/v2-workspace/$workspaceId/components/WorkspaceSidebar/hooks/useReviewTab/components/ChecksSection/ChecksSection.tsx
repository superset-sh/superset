import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuLoaderCircle,
	LuMinus,
	LuX,
} from "react-icons/lu";
import { VscChevronRight } from "react-icons/vsc";
import type { NormalizedCheck, NormalizedPR } from "../../types";

const checkIconConfig = {
	success: {
		icon: LuCheck,
		className: "text-emerald-600 dark:text-emerald-400",
	},
	failure: { icon: LuX, className: "text-red-600 dark:text-red-400" },
	pending: {
		icon: LuLoaderCircle,
		className: "text-amber-600 dark:text-amber-400",
	},
	skipped: { icon: LuMinus, className: "text-muted-foreground" },
	cancelled: { icon: LuMinus, className: "text-muted-foreground" },
} as const;

const checkSummaryIconConfig = {
	success: checkIconConfig.success,
	failure: checkIconConfig.failure,
	pending: checkIconConfig.pending,
	none: { icon: LuMinus, className: "text-muted-foreground" },
} as const;

interface ChecksSectionProps {
	checks: NormalizedCheck[];
	checksStatus: NormalizedPR["checksStatus"];
	prUrl: string;
}

export function ChecksSection({
	checks,
	checksStatus,
	prUrl,
}: ChecksSectionProps) {
	const [open, setOpen] = useState(true);

	const relevantChecks = useMemo(
		() =>
			checks.filter(
				(check) => check.status !== "skipped" && check.status !== "cancelled",
			),
		[checks],
	);

	const passingChecks = relevantChecks.filter(
		(check) => check.status === "success",
	).length;
	const checksSummary =
		relevantChecks.length > 0
			? `${passingChecks}/${relevantChecks.length} checks passing`
			: "No checks reported";
	const checksStatusConfig = checkSummaryIconConfig[checksStatus];
	const ChecksStatusIcon = checksStatusConfig.icon;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger
				className={cn(
					"flex w-full min-w-0 items-center justify-between gap-2 px-2 py-1.5 text-left",
					"cursor-pointer transition-colors hover:bg-accent/30",
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<VscChevronRight
						className={cn(
							"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
							open && "rotate-90",
						)}
					/>
					<span className="truncate text-xs font-medium">Checks</span>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{relevantChecks.length}
					</span>
				</div>
				<div
					className={cn(
						"flex shrink-0 items-center gap-1",
						checksStatusConfig.className,
					)}
				>
					<ChecksStatusIcon
						className={cn(
							"size-3.5 shrink-0",
							checksStatus === "pending" && "animate-spin",
						)}
					/>
					<span className="max-w-[140px] truncate text-[10px] normal-case">
						{checksSummary}
					</span>
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent className="min-w-0 overflow-hidden px-0.5 pb-1">
				{relevantChecks.length === 0 ? (
					<div className="px-1.5 py-1 text-xs text-muted-foreground">
						No checks reported.
					</div>
				) : (
					relevantChecks.map((check, index) => (
						<CheckRow
							key={`${check.name}-${index}`}
							check={check}
							prUrl={prUrl}
						/>
					))
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

function resolveCheckUrl(
	check: NormalizedCheck,
	prUrl: string,
): string | undefined {
	if (check.url) return check.url;
	const name = check.name.trim().toLowerCase();
	if (name.includes("coderabbit") || name.includes("code rabbit")) return prUrl;
	return undefined;
}

function CheckRow({ check, prUrl }: { check: NormalizedCheck; prUrl: string }) {
	const { icon: CheckIcon, className } = checkIconConfig[check.status];
	const checkUrl = resolveCheckUrl(check, prUrl);

	const inner = (
		<div className="flex min-w-0 items-center gap-1 rounded-sm px-1.5 py-1 text-xs transition-colors hover:bg-accent/50">
			<CheckIcon
				className={cn(
					"size-3 shrink-0",
					className,
					check.status === "pending" && "animate-spin",
				)}
			/>
			<div className="flex min-w-0 flex-1 items-center gap-1">
				<span className="min-w-0 truncate">{check.name}</span>
				{checkUrl && (
					<LuArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
				)}
			</div>
			{check.durationText && (
				<span className="shrink-0 text-[10px] text-muted-foreground">
					{check.durationText}
				</span>
			)}
		</div>
	);

	return checkUrl ? (
		<a
			href={checkUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="group block"
		>
			{inner}
		</a>
	) : (
		inner
	);
}
