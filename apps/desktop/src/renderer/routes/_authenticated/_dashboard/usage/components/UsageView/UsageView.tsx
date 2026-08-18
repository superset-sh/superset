import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../../hooks/useHostUsageQuota";
import { useHostUsageQuota } from "../../hooks/useHostUsageQuota";
import { UsageHistorySection } from "../UsageHistorySection";
import { formatResetIn, formatResetLabel } from "./utils/formatResetIn";

const PROVIDER_LABELS: Record<UsageAccount["provider"], string> = {
	claude: "Claude Code",
	codex: "Codex",
};

function meterColor(usedPercent: number): string {
	if (usedPercent >= 90) return "bg-red-500";
	if (usedPercent >= 70) return "bg-amber-500";
	return "bg-primary";
}

/** One line per window: label · bar · % · reset. Density over ceremony. */
function QuotaWindowRow({ window }: { window: UsageQuotaWindow }) {
	const percent = Math.min(window.usedPercent, 100);
	return (
		<div className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem_5rem] items-center gap-2">
			<span className="truncate text-[11px] text-muted-foreground">
				{window.label}
			</span>
			<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full", meterColor(window.usedPercent))}
					style={{ width: `${Math.max(percent, 1)}%` }}
				/>
			</div>
			<span className="text-right text-[11px] tabular-nums">
				{window.usedPercent}%
			</span>
			<span
				className="text-right text-[11px] text-muted-foreground tabular-nums"
				title={window.resetsAt ? formatResetLabel(window.resetsAt) : undefined}
			>
				{window.resetsAt ? `↺ ${formatResetIn(window.resetsAt)}` : ""}
			</span>
		</div>
	);
}

function creditsLine(account: UsageAccount): string | null {
	if (account.creditsBalance !== null) {
		return `$${account.creditsBalance.toFixed(2)} credits`;
	}
	if (account.extraUsage) {
		return `extra $${(account.extraUsage.usedCents / 100).toFixed(2)} of $${(account.extraUsage.limitCents / 100).toFixed(2)}`;
	}
	return null;
}

function AccountCard({ account }: { account: UsageAccount }) {
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(account.provider, isDark);
	const credits = creditsLine(account);
	return (
		<div className="rounded-lg border bg-card/40 p-2.5">
			<div className="flex items-baseline gap-1.5">
				{icon && <img src={icon} alt="" className="size-3.5 self-center" />}
				<span className="truncate text-xs font-medium">
					{account.email ?? PROVIDER_LABELS[account.provider]}
				</span>
				{account.plan && (
					<span className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
						{account.plan}
					</span>
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{credits ?? account.sourceLabel}
				</span>
			</div>
			{account.status === "ok" ? (
				<div className="mt-2 flex flex-col gap-1.5">
					{account.windows.map((window) => (
						<QuotaWindowRow key={window.id} window={window} />
					))}
				</div>
			) : (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					{account.statusDetail ??
						(account.status === "token_expired"
							? "Token expired."
							: "Usage unavailable.")}
				</div>
			)}
		</div>
	);
}

export function UsageView({ hostUrl }: { hostUrl: string | null }) {
	const quotaQuery = useHostUsageQuota(hostUrl);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const accounts = quotaQuery.data ?? [];
	const isBusy = quotaQuery.isFetching || isRefreshing;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex items-center gap-2">
				<h1 className="text-base font-semibold tracking-tight">Usage</h1>
				<span className="ml-auto text-[10px] text-muted-foreground">
					Official quota · refreshes every 5 min
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					disabled={isBusy || !hostUrl}
					onClick={() => {
						setIsRefreshing(true);
						void quotaQuery
							.refresh()
							// A failed refresh keeps the last good data; the next poll retries.
							.catch(() => {})
							.finally(() => setIsRefreshing(false));
					}}
				>
					<LuRefreshCw className={cn("size-3", isBusy && "animate-spin")} />
				</Button>
			</div>

			{quotaQuery.isPending ? (
				<div className="py-4 text-center text-xs text-muted-foreground">
					Reading subscription usage…
				</div>
			) : accounts.length === 0 ? (
				<div className="py-4 text-center text-xs text-muted-foreground">
					No AI subscription logins found on this host — sign in to Claude Code
					or Codex and usage will appear here.
				</div>
			) : (
				<div className="grid gap-2 md:grid-cols-2">
					{accounts.map((account) => (
						<AccountCard key={account.accountKey} account={account} />
					))}
				</div>
			)}

			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
