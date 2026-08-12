import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineChartPie,
	HiOutlineEye,
	HiOutlineEyeSlash,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { MetricToggle } from "./components/MetricToggle";
import { ProviderUsageRow } from "./components/ProviderUsageRow";
import {
	defaultUsageMetricSelection,
	getLowestSelectedRemainingPercent,
	getMenuBarSummaryParts,
	getProviderUsageRefetchInterval,
	PROVIDER_USAGE_REFETCH_INTERVAL_MS,
	shouldQueryProviderUsage,
	type UsageMetricSelection,
} from "./usageIndicatorPolicy";

const METRIC_SELECTION_STORAGE_KEY = "superset.aiUsage.metricSelection";

function readStoredMetricSelection(): UsageMetricSelection {
	if (typeof window === "undefined") return defaultUsageMetricSelection;
	try {
		const parsed = JSON.parse(
			window.localStorage.getItem(METRIC_SELECTION_STORAGE_KEY) ?? "",
		) as Partial<UsageMetricSelection>;
		return {
			showsClaudeFiveHour:
				parsed.showsClaudeFiveHour ??
				defaultUsageMetricSelection.showsClaudeFiveHour,
			showsClaudeWeekly:
				parsed.showsClaudeWeekly ??
				defaultUsageMetricSelection.showsClaudeWeekly,
			showsClaudeFable:
				parsed.showsClaudeFable ?? defaultUsageMetricSelection.showsClaudeFable,
			showsCodexWeekly:
				parsed.showsCodexWeekly ?? defaultUsageMetricSelection.showsCodexWeekly,
		};
	} catch {
		return defaultUsageMetricSelection;
	}
}

function accessibleSummaryLabel(parts: string[], fallback: string): string {
	if (parts.length === 0) return fallback;
	return parts
		.map((part) => {
			const value = part.split(" ").at(-1);
			return value && value !== "—" ? `${part}% remaining` : part;
		})
		.join(", ");
}

function mutationErrorMessage(error: unknown): string {
	return error instanceof Error && error.message
		? error.message
		: "Codex account action failed.";
}

interface AIUsageIndicatorProps {
	/**
	 * "top-bar" renders the compact text summary used in the v1 TopBar;
	 * "sidebar" renders an icon-only trigger sized for the v2 sidebar footer.
	 */
	variant?: "top-bar" | "sidebar";
}

export function AIUsageIndicator({
	variant = "top-bar",
}: AIUsageIndicatorProps) {
	const [open, setOpen] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [blurEmails, setBlurEmails] = useState(false);
	const [accountActionError, setAccountActionError] = useState<string | null>(
		null,
	);
	const [selection, setSelection] = useState<UsageMetricSelection>(
		readStoredMetricSelection,
	);
	const utils = electronTrpc.useUtils();
	const { data: indicatorEnabled } =
		electronTrpc.settings.getShowAiUsageIndicator.useQuery();
	const { data, isFetching } = electronTrpc.providerUsage.getSnapshot.useQuery(
		undefined,
		{
			enabled: shouldQueryProviderUsage(open),
			staleTime: PROVIDER_USAGE_REFETCH_INTERVAL_MS,
			refetchInterval: getProviderUsageRefetchInterval(open),
			refetchIntervalInBackground: false,
		},
	);
	const providers = data?.providers ?? [];
	const remaining = getLowestSelectedRemainingPercent(providers, selection);
	const summaryParts = getMenuBarSummaryParts(providers, selection);
	const compactLabel =
		summaryParts.length > 0
			? summaryParts.join(" · ")
			: remaining === null
				? "—"
				: `${remaining}% left`;
	const compactAriaLabel = accessibleSummaryLabel(
		summaryParts,
		remaining === null ? "unavailable" : `${remaining}% remaining`,
	);

	useEffect(() => {
		window.localStorage.setItem(
			METRIC_SELECTION_STORAGE_KEY,
			JSON.stringify(selection),
		);
	}, [selection]);

	const importCodex = electronTrpc.providerUsage.importCurrentCodex.useMutation(
		{
			onMutate: () => setAccountActionError(null),
			onSuccess: () => {
				setAccountActionError(null);
				void utils.providerUsage.getSnapshot.invalidate();
			},
			onError: (error) => setAccountActionError(mutationErrorMessage(error)),
		},
	);
	const addCodex = electronTrpc.providerUsage.addCodexAccount.useMutation({
		onMutate: () => setAccountActionError(null),
		onSuccess: () => {
			setAccountActionError(null);
			void utils.providerUsage.getSnapshot.invalidate();
		},
		onError: (error) => setAccountActionError(mutationErrorMessage(error)),
	});
	const switchCodex = electronTrpc.providerUsage.switchCodexProfile.useMutation(
		{
			onMutate: () => setAccountActionError(null),
			onSuccess: () => {
				setAccountActionError(null);
				void utils.providerUsage.getSnapshot.invalidate();
			},
			onError: (error) => setAccountActionError(mutationErrorMessage(error)),
		},
	);
	const accountActionPending =
		importCodex.isPending || addCodex.isPending || switchCodex.isPending;

	async function refreshNow() {
		setIsRefreshing(true);
		try {
			const snapshot = await utils.client.providerUsage.getSnapshot.query({
				force: true,
			});
			utils.providerUsage.getSnapshot.setData(undefined, snapshot);
		} catch {
			// Keep the last safe snapshot; the next scheduled refresh will retry.
		} finally {
			setIsRefreshing(false);
		}
	}

	function toggleMetric(key: keyof UsageMetricSelection) {
		setSelection((value) => ({
			...value,
			[key]: !value[key],
		}));
	}

	if (!indicatorEnabled) return null;

	const ariaLabel =
		remaining === null
			? "AI provider capacity unavailable"
			: `AI provider capacity: ${compactAriaLabel}`;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						{variant === "sidebar" ? (
							<button
								type="button"
								aria-label={ariaLabel}
								className={cn(
									"flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
									open
										? "bg-fill-selected text-muted-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<HiOutlineChartPie className="size-3.5" />
							</button>
						) : (
							<Button
								variant="ghost"
								size="sm"
								aria-label={ariaLabel}
								className="no-drag h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
							>
								<HiOutlineChartPie className="size-3.5" />
								<span className="max-w-28 truncate text-[10px] font-medium tabular-nums">
									{compactLabel}
								</span>
							</Button>
						)}
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent
					side={variant === "sidebar" ? "top" : "bottom"}
					sideOffset={6}
					showArrow={false}
				>
					{variant === "sidebar" && summaryParts.length > 0
						? compactLabel
						: "AI capacity remaining"}
				</TooltipContent>
			</Tooltip>

			<PopoverContent
				align={variant === "sidebar" ? "start" : "end"}
				side={variant === "sidebar" ? "top" : "bottom"}
				className="w-80 overflow-hidden p-0"
			>
				<div className="flex items-center justify-between px-3.5 py-2.5">
					<div>
						<h4 className="text-xs font-medium text-foreground">AI capacity</h4>
						<p className="mt-0.5 text-[9px] text-muted-foreground">
							Remaining subscription capacity
						</p>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setBlurEmails((value) => !value)}
							aria-pressed={blurEmails}
							className="inline-flex h-6 items-center gap-1 rounded border border-border/60 bg-card/80 px-2 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-foreground/[0.06] hover:text-foreground aria-pressed:bg-foreground/[0.08] aria-pressed:text-foreground"
							aria-label={blurEmails ? "Show emails" : "Blur emails"}
						>
							{blurEmails ? (
								<HiOutlineEyeSlash className="size-3" />
							) : (
								<HiOutlineEye className="size-3" />
							)}
							<span>{blurEmails ? "Blurred" : "Blur"}</span>
						</button>
						<button
							type="button"
							onClick={() => void refreshNow()}
							disabled={isRefreshing}
							className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
							aria-label="Refresh AI usage"
						>
							<HiOutlineArrowPath
								className={cn(
									"size-3.5",
									(isFetching || isRefreshing) && "animate-spin",
								)}
							/>
						</button>
					</div>
				</div>
				<div className="border-t border-border/60 px-3.5 py-2">
					<div className="flex flex-wrap gap-1">
						<MetricToggle
							label="A 5h"
							description="Anthropic Claude five-hour limit"
							active={selection.showsClaudeFiveHour}
							onClick={() => toggleMetric("showsClaudeFiveHour")}
						/>
						<MetricToggle
							label="A W"
							description="Anthropic Claude weekly limit"
							active={selection.showsClaudeWeekly}
							onClick={() => toggleMetric("showsClaudeWeekly")}
						/>
						<MetricToggle
							label="Fable"
							description="Claude Fable weekly limit"
							active={selection.showsClaudeFable}
							onClick={() => toggleMetric("showsClaudeFable")}
						/>
						<MetricToggle
							label="C W"
							description="OpenAI Codex weekly limit"
							active={selection.showsCodexWeekly}
							onClick={() => toggleMetric("showsCodexWeekly")}
						/>
					</div>
				</div>
				{providers.map((provider) => (
					<ProviderUsageRow
						key={provider.providerId}
						provider={provider}
						blurEmails={blurEmails}
						accountActionsDisabled={accountActionPending}
						onSwitchProfile={(profileName) => {
							if (accountActionPending) return;
							switchCodex.mutate({ profileName });
						}}
					/>
				))}
				<div className="flex gap-1 border-t border-border/60 px-3.5 py-2.5">
					<button
						type="button"
						onClick={() => importCodex.mutate()}
						disabled={accountActionPending}
						className="inline-flex h-6 items-center rounded border border-border/60 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
					>
						Import Codex
					</button>
					<button
						type="button"
						onClick={() => addCodex.mutate()}
						disabled={accountActionPending}
						className="inline-flex h-6 items-center rounded border border-border/60 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
					>
						Add Codex
					</button>
				</div>
				{accountActionError && (
					<p className="border-t border-border/60 px-3.5 py-2 text-[10px] leading-relaxed text-amber-600 select-text cursor-text">
						{accountActionError}
					</p>
				)}
				{!data && (
					<p className="border-t border-border/60 px-3.5 py-3 text-[10px] text-muted-foreground">
						Reading provider usage…
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
