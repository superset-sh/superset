import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuEllipsis, LuPlus, LuRefreshCw } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../../hooks/useHostUsageQuota";
import { useHostUsageQuota } from "../../hooks/useHostUsageQuota";
import { useRemoveUsageAccount } from "../../hooks/useRemoveUsageAccount";
import { useSetDefaultUsageAccount } from "../../hooks/useSetDefaultUsageAccount";
import { UsageHistorySection } from "../UsageHistorySection";
import type { SwitchSignInTarget } from "./components/AddAccountDialog";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { RemoveAccountDialog } from "./components/RemoveAccountDialog";
import { formatResetIn, formatResetLabel } from "./utils/formatResetIn";

type Provider = UsageAccount["provider"];

const PROVIDERS: Provider[] = ["claude", "codex"];

const PROVIDER_LABELS: Record<Provider, string> = {
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

function AccountCard({
	account,
	onMakeDefault,
	onSwitchSignIn,
	onRemove,
	isSwitching,
}: {
	account: UsageAccount;
	onMakeDefault: () => void;
	onSwitchSignIn: () => void;
	/** Null on the system-default card — the main login is never removable. */
	onRemove: (() => void) | null;
	isSwitching: boolean;
}) {
	const credits = creditsLine(account);
	return (
		<div className="group rounded-lg border bg-card/40 p-2.5">
			<div className="flex items-baseline gap-1.5">
				<span className="truncate text-xs font-medium">
					{account.email ?? PROVIDER_LABELS[account.provider]}
				</span>
				{account.plan && (
					<span className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
						{account.plan}
					</span>
				)}
				{account.status !== "ok" && (
					<span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-500">
						{account.status === "token_expired"
							? "Sign-in expired"
							: account.status === "signed_out"
								? "Signed out"
								: "Unavailable"}
					</span>
				)}
				{account.isDefault ? (
					<span
						className="rounded bg-primary/15 px-1 text-[9px] font-medium uppercase tracking-wide text-primary"
						title="New terminals and agents use this account. Existing ones keep theirs."
					>
						Default
					</span>
				) : (
					<Button
						variant="ghost"
						size="sm"
						className="h-4 rounded px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
						disabled={isSwitching}
						title="Launch new terminals and agents on this account. Existing ones keep theirs."
						onClick={onMakeDefault}
					>
						Make default
					</Button>
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{/* Source label always shows — it is the only thing that tells two
					    profiles of the same account apart. */}
					{credits
						? `${credits} · ${account.sourceLabel}`
						: account.sourceLabel}
				</span>
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-4 shrink-0 self-center opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
						>
							<LuEllipsis className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onSwitchSignIn}>
							Switch sign-in…
						</DropdownMenuItem>
						{onRemove && (
							<DropdownMenuItem variant="destructive" onClick={onRemove}>
								Remove…
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
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
	const setDefault = useSetDefaultUsageAccount(hostUrl);
	const removeAccount = useRemoveUsageAccount(hostUrl);
	const isDark = useIsDarkTheme();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [dialogProvider, setDialogProvider] = useState<Provider>("claude");
	const [switchTarget, setSwitchTarget] = useState<SwitchSignInTarget | null>(
		null,
	);
	const [removeTarget, setRemoveTarget] = useState<UsageAccount | null>(null);

	const accounts = quotaQuery.data ?? [];
	const isBusy = quotaQuery.isFetching || isRefreshing;

	const makeDefaultAccount = (account: UsageAccount) => {
		setDefault.mutate(
			{ provider: account.provider, selection: account.selection },
			{
				onSuccess: () => {
					toast.success(
						`New ${PROVIDER_LABELS[account.provider]} terminals and agents will use ${account.email ?? account.sourceLabel}.`,
						{
							description:
								"Running sessions keep their current account — restart them to switch.",
						},
					);
				},
				onError: (error) => toast.error(error.message),
			},
		);
	};

	const openAddAccount = (provider: Provider) => {
		setDialogProvider(provider);
		setSwitchTarget(null);
		setIsDialogOpen(true);
	};

	const openSwitchSignIn = (account: UsageAccount) => {
		setDialogProvider(account.provider);
		setSwitchTarget({
			provider: account.provider,
			selection: account.selection,
			label:
				account.selection === null
					? (account.email ?? account.sourceLabel)
					: account.sourceLabel,
		});
		setIsDialogOpen(true);
	};

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex items-center gap-2">
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
			) : (
				PROVIDERS.map((provider) => {
					const providerAccounts = accounts.filter(
						(account) => account.provider === provider,
					);
					const icon = getPresetIcon(provider, isDark);
					return (
						<section key={provider} className="flex flex-col gap-1.5">
							<div className="flex items-center gap-1.5">
								{icon && <img src={icon} alt="" className="size-3.5" />}
								<span className="text-xs font-medium">
									{PROVIDER_LABELS[provider]}
								</span>
								<Button
									variant="ghost"
									size="sm"
									className="ml-auto h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
									disabled={!hostUrl}
									onClick={() => openAddAccount(provider)}
								>
									<LuPlus className="size-3" />
									Add account
								</Button>
							</div>
							{providerAccounts.length === 0 ? (
								<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
									No {PROVIDER_LABELS[provider]} logins on this host — sign in
									and usage appears here.
								</div>
							) : (
								<div className="grid gap-2 md:grid-cols-2">
									{providerAccounts.map((account) => (
										<AccountCard
											key={account.accountKey}
											account={account}
											onMakeDefault={() => makeDefaultAccount(account)}
											onSwitchSignIn={() => openSwitchSignIn(account)}
											onRemove={
												account.selection === null
													? null
													: () => setRemoveTarget(account)
											}
											isSwitching={setDefault.isPending}
										/>
									))}
								</div>
							)}
						</section>
					);
				})
			)}

			<RemoveAccountDialog
				account={removeTarget}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				isRemoving={removeAccount.isPending}
				onConfirm={() => {
					if (!removeTarget || removeTarget.selection === null) return;
					removeAccount.mutate(
						{
							provider: removeTarget.provider,
							selection: removeTarget.selection,
						},
						{
							onSuccess: () => {
								toast.success(
									`Removed ${removeTarget.email ?? removeTarget.sourceLabel}.`,
								);
								setRemoveTarget(null);
							},
							onError: (error) => toast.error(error.message),
						},
					);
				}}
			/>

			<AddAccountDialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					setIsDialogOpen(open);
					if (!open) setSwitchTarget(null);
				}}
				provider={dialogProvider}
				switchTarget={switchTarget}
				hostUrl={hostUrl}
				onAccountAdded={() => {
					setIsRefreshing(true);
					void quotaQuery
						.refresh()
						.catch(() => {})
						.finally(() => setIsRefreshing(false));
				}}
			/>

			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
