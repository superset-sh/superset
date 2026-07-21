import { cn } from "@superset/ui/lib/utils";
import type { ProviderUsage } from "lib/trpc/routers/provider-usage.schema";
import { formatResetLabel } from "./usageIndicatorPolicy";

interface ProviderUsageRowProps {
	provider: ProviderUsage;
}

export function ProviderUsageRow({ provider }: ProviderUsageRowProps) {
	return (
		<section className="px-3.5 py-3 border-t border-border/60 first:border-t-0">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0 flex items-baseline gap-2">
					<h5 className="text-xs font-medium text-foreground">
						{provider.providerName}
					</h5>
					{provider.accountLabel && (
						<span className="truncate text-[10px] text-muted-foreground">
							{provider.accountLabel}
						</span>
					)}
				</div>
				<span
					className={cn(
						"size-1.5 rounded-full",
						provider.status === "ok"
							? "bg-emerald-500"
							: "bg-muted-foreground/40",
					)}
					title={provider.status === "ok" ? "Connected" : "Not connected"}
				/>
			</div>

			{provider.status === "ok" ? (
				<div className="mt-2.5 space-y-2.5">
					{provider.windows.map((window) => (
						<div key={window.id}>
							<div className="grid grid-cols-[3.25rem_1fr_2.5rem] items-center gap-2">
								<span className="text-[10px] text-muted-foreground">
									{window.label}
								</span>
								<div
									className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
									role="progressbar"
									aria-label={`${provider.providerName} ${window.label} capacity remaining`}
									aria-valuemin={0}
									aria-valuemax={100}
									aria-valuenow={Math.round(window.remainingPercent)}
								>
									<div
										className={cn(
											"h-full rounded-full transition-[width]",
											provider.providerId === "claude"
												? "bg-orange-400"
												: "bg-sky-400",
										)}
										style={{ width: `${window.remainingPercent}%` }}
									/>
								</div>
								<strong className="text-right text-[10px] font-medium tabular-nums text-foreground">
									{Math.round(window.remainingPercent)}%
								</strong>
							</div>
							<div className="mt-1 text-right text-[9px] tabular-nums text-muted-foreground">
								{window.resetAt
									? `Resets ${formatResetLabel(window.resetAt)}`
									: "Reset time unavailable"}
							</div>
						</div>
					))}
				</div>
			) : (
				<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground select-text cursor-text">
					{provider.status === "not-configured"
						? `Sign in with ${provider.providerName} CLI to see limits.`
						: provider.errorMessage}
				</p>
			)}
		</section>
	);
}
