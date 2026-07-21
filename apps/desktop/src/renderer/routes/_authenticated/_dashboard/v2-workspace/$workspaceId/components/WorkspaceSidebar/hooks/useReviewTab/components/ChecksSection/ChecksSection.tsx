import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuClipboard,
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
	workspaceId: string;
	checks: NormalizedCheck[];
	checksStatus: NormalizedPR["checksStatus"];
	prUrl: string;
}

export function ChecksSection({
	workspaceId,
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
							workspaceId={workspaceId}
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

function CheckRow({
	workspaceId,
	check,
	prUrl,
}: {
	workspaceId: string;
	check: NormalizedCheck;
	prUrl: string;
}) {
	const { icon: CheckIcon, className } = checkIconConfig[check.status];
	const checkUrl = resolveCheckUrl(check, prUrl);
	// Mirror the server's guard: only failed github.com Actions job URLs have
	// downloadable logs, so don't offer copy for non-GitHub CI checks.
	const canCopyLogs =
		check.status === "failure" &&
		!!check.url &&
		URL.canParse(check.url) &&
		new URL(check.url).hostname === "github.com" &&
		/\/job\/\d+/.test(check.url);

	const rowContent = (
		<div className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1.5 py-1 text-xs transition-colors hover:bg-accent/50">
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

	// Keep the copy button a sibling of the link, never a child: nesting an
	// interactive element inside an <a> is invalid HTML and breaks AT focus.
	return (
		<div className="group flex min-w-0 items-center gap-0.5">
			{checkUrl ? (
				<a
					href={checkUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="block min-w-0 flex-1"
				>
					{rowContent}
				</a>
			) : (
				rowContent
			)}
			{canCopyLogs && check.url && (
				<CopyLogsButton workspaceId={workspaceId} detailsUrl={check.url} />
			)}
		</div>
	);
}

function CopyLogsButton({
	workspaceId,
	detailsUrl,
}: {
	workspaceId: string;
	detailsUrl: string;
}) {
	const utils = workspaceTrpc.useUtils();
	const [state, setState] = useState<"idle" | "loading" | "copied" | "error">(
		"idle",
	);
	const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(resetTimer.current), []);

	const handleCopy = async () => {
		if (state === "loading") return;
		// Cancel a pending reset so it can't fire mid-flight on a quick re-click.
		clearTimeout(resetTimer.current);
		setState("loading");
		try {
			const { logs } = await utils.git.getCheckJobLogs.fetch({
				workspaceId,
				detailsUrl,
			});
			await navigator.clipboard.writeText(logs);
			setState("copied");
		} catch {
			setState("error");
		}
		resetTimer.current = setTimeout(() => setState("idle"), 2000);
	};

	const Icon =
		state === "loading"
			? LuLoaderCircle
			: state === "copied"
				? LuCheck
				: state === "error"
					? LuX
					: LuClipboard;

	return (
		<button
			type="button"
			onClick={handleCopy}
			title="Copy job logs to clipboard"
			aria-label="Copy job logs to clipboard"
			className={cn(
				"shrink-0 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground",
				"opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
				state !== "idle" && "opacity-100",
				state === "copied" && "text-emerald-600 dark:text-emerald-400",
				state === "error" && "text-red-600 dark:text-red-400",
			)}
		>
			<Icon className={cn("size-3", state === "loading" && "animate-spin")} />
		</button>
	);
}
