import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiOutlineArrowPath, HiOutlineChartPie } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProviderUsageRow } from "./components/ProviderUsageRow";
import {
	getLowestRemainingPercent,
	getProviderUsageRefetchInterval,
	PROVIDER_USAGE_REFETCH_INTERVAL_MS,
	shouldQueryProviderUsage,
} from "./usageIndicatorPolicy";

export function AIUsageIndicator() {
	const [open, setOpen] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const utils = electronTrpc.useUtils();
	const { data, isFetching } = electronTrpc.providerUsage.getSnapshot.useQuery(
		undefined,
		{
			enabled: shouldQueryProviderUsage(open),
			staleTime: PROVIDER_USAGE_REFETCH_INTERVAL_MS,
			refetchInterval: getProviderUsageRefetchInterval(open),
			refetchIntervalInBackground: false,
		},
	);
	const remaining = getLowestRemainingPercent(data?.providers ?? []);

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

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							aria-label={
								remaining === null
									? "AI provider capacity unavailable"
									: `AI provider capacity: ${remaining}% remaining`
							}
							className="no-drag h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
						>
							<HiOutlineChartPie className="size-3.5" />
							<span className="text-[10px] font-medium tabular-nums">
								{remaining === null ? "—" : `${remaining}% left`}
							</span>
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
					AI capacity remaining
				</TooltipContent>
			</Tooltip>

			<PopoverContent align="end" className="w-80 overflow-hidden p-0">
				<div className="flex items-center justify-between px-3.5 py-2.5">
					<div>
						<h4 className="text-xs font-medium text-foreground">AI capacity</h4>
						<p className="mt-0.5 text-[9px] text-muted-foreground">
							Remaining subscription capacity
						</p>
					</div>
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
				{data?.providers.map((provider) => (
					<ProviderUsageRow key={provider.providerId} provider={provider} />
				))}
				{!data && (
					<p className="border-t border-border/60 px-3.5 py-3 text-[10px] text-muted-foreground">
						Reading provider usage…
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
