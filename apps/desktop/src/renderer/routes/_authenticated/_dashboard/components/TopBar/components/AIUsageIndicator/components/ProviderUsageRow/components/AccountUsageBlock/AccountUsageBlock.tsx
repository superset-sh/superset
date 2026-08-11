import { cn } from "@superset/ui/lib/utils";
import type {
	ProviderUsage,
	ProviderUsageAccount,
} from "lib/trpc/routers/provider-usage.schema";
import type { ReactNode } from "react";
import { formatResetLabel } from "../../../../usageIndicatorPolicy";

export function AccountUsageBlock({
	provider,
	account,
	blurEmails,
	actionsDisabled,
	onSwitchProfile,
	renderEmailText,
}: {
	provider: ProviderUsage;
	account: ProviderUsageAccount;
	blurEmails: boolean;
	actionsDisabled: boolean;
	onSwitchProfile?: (profileName: string) => void;
	renderEmailText: (value: string, blurEmails: boolean) => ReactNode;
}) {
	const accessibleAccountLabel = blurEmails
		? "account"
		: (account.accountLabel ?? account.profileName);
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 flex items-center gap-1.5">
					<span className="truncate text-[10px] font-medium text-foreground">
						{renderEmailText(
							account.accountLabel ?? account.profileName,
							blurEmails,
						)}
					</span>
					<span className="shrink-0 text-[9px] text-muted-foreground">
						{account.isActive ? "Active" : "Inactive"}
					</span>
					{account.statusMessage && (
						<span className="truncate text-[9px] text-muted-foreground">
							{account.statusMessage}
						</span>
					)}
				</div>
				{provider.providerId === "codex" && !account.isActive && (
					<button
						type="button"
						disabled={actionsDisabled}
						onClick={() => onSwitchProfile?.(account.profileName)}
						className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
					>
						Switch
					</button>
				)}
			</div>
			{account.windows.length > 0 ? (
				account.windows.map((window) => (
					<div key={`${account.id}:${window.id}`}>
						<div className="grid grid-cols-[3.25rem_1fr_2.5rem] items-center gap-2">
							<span className="text-[10px] text-muted-foreground">
								{window.label}
							</span>
							<div
								className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
								role="progressbar"
								aria-label={`${provider.providerName} ${accessibleAccountLabel} ${window.label} capacity remaining`}
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
								: account.status === "cached"
									? "Available after using this account"
									: "Reset time unavailable"}
						</div>
					</div>
				))
			) : (
				<p className="text-[10px] text-muted-foreground">
					{account.statusMessage ?? "No usage reading yet"}
				</p>
			)}
		</div>
	);
}
