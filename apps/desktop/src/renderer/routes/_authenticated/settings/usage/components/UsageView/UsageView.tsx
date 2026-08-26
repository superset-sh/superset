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
import {
	LuCheck,
	LuCircle,
	LuCircleCheck,
	LuCopy,
	LuEllipsis,
	LuEye,
	LuEyeOff,
	LuPlus,
	LuRefreshCw,
} from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../../hooks/useHostUsageQuota";
import { useHostUsageQuota } from "../../hooks/useHostUsageQuota";
import { useRemoveUsageAccount } from "../../hooks/useRemoveUsageAccount";
import { useSetDefaultUsageAccount } from "../../hooks/useSetDefaultUsageAccount";
import { LeaderboardPrompt } from "../LeaderboardPrompt";
import { UsageHistorySection } from "../UsageHistorySection";
import type { SwitchSignInTarget } from "./components/AddAccountDialog";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { RemoveAccountDialog } from "./components/RemoveAccountDialog";
import { formatResetIn, formatResetLabel } from "./utils/formatResetIn";
import { switchSignInCommand } from "./utils/switchSignInCommand";

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

const DEFAULT_TITLE =
	"New agent launches use this account. Relaunch a running agent to switch it.";

function AccountCard({
	account,
	onMakeDefault,
	onSwitchSignIn,
	onRemove,
	isSwitching,
	selectable,
	hideEmails,
}: {
	account: UsageAccount;
	onMakeDefault: () => void;
	onSwitchSignIn: () => void;
	/** Null on the system-default card — the main login is never removable. */
	onRemove: (() => void) | null;
	isSwitching: boolean;
	/** True when the provider has several accounts, so the cards read as a
	 * radio group: the default gets a check + accent border, the rest get a
	 * selectable circle. */
	selectable: boolean;
	/** Replaces account emails so screenshots do not retain identifying pixels. */
	hideEmails: boolean;
}) {
	const credits = creditsLine(account);
	const { copyToClipboard, copied } = useCopyToClipboard();
	const expiredCommand =
		account.status === "token_expired" ? switchSignInCommand(account) : null;
	return (
		<div
			className={cn(
				"group rounded-lg border bg-card/40 p-2.5",
				selectable &&
					account.isDefault &&
					"border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40",
			)}
		>
			<div className="flex items-baseline gap-1.5">
				{selectable &&
					(account.isDefault ? (
						<span className="shrink-0 self-center" title={DEFAULT_TITLE}>
							<LuCircleCheck className="size-3.5 text-primary" />
						</span>
					) : (
						<button
							type="button"
							className="shrink-0 self-center text-muted-foreground/50 transition-colors hover:text-primary disabled:pointer-events-none"
							disabled={isSwitching}
							title="Make default — launch new terminals and agents on this account."
							onClick={onMakeDefault}
						>
							<LuCircle className="size-3.5" />
						</button>
					))}
				<span
					className={cn(
						"truncate text-xs font-medium transition-[filter]",
						hideEmails && account.email && "select-none blur-[5px]",
					)}
				>
					{hideEmails && account.email
						? "Email hidden"
						: (account.email ?? PROVIDER_LABELS[account.provider])}
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
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{/* Source label always shows — it is the only thing that tells two
					    profiles of the same account apart. */}
					{account.sourceLabel}
				</span>
				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-4 shrink-0 self-center text-muted-foreground"
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
			) : expiredCommand !== null ? (
				<div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
					<span>Sign-in expired — run</span>
					<button
						type="button"
						className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-muted/70"
						title={expiredCommand}
						onClick={() =>
							copyToClipboard(expiredCommand).catch(() =>
								toast.error("Copy failed", { description: expiredCommand }),
							)
						}
					>
						<span className="min-w-0 truncate">{expiredCommand}</span>
						{copied ? (
							<LuCheck className="size-2.5 shrink-0 text-green-500" />
						) : (
							<LuCopy className="size-2.5 shrink-0" />
						)}
					</button>
					<span>in a terminal on this host.</span>
				</div>
			) : (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					{account.statusDetail ?? "Usage unavailable."}
				</div>
			)}
			{/* The radio + accent border already mark the default when the cards
			    read as a group; the footer label only carries it for a lone card. */}
			{(!account.isDefault || !selectable || credits) && (
				<div className="mt-2 flex items-center gap-2 border-t pt-1.5">
					{account.isDefault ? (
						!selectable && (
							<span
								className="inline-flex items-center gap-1 text-[10px] font-medium text-primary"
								title={DEFAULT_TITLE}
							>
								<LuCircleCheck className="size-3" />
								Default for new agents
							</span>
						)
					) : (
						<Button
							variant="outline"
							size="sm"
							className="h-5 rounded px-1.5 text-[10px]"
							disabled={isSwitching}
							title={DEFAULT_TITLE}
							onClick={onMakeDefault}
						>
							Make default
						</Button>
					)}
					{credits && (
						<span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
							{credits}
						</span>
					)}
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
	const [hideEmails, setHideEmails] = useState(false);
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
						`New ${PROVIDER_LABELS[account.provider]} agents will use ${account.email ?? account.sourceLabel}.`,
						{
							description: "Relaunch running agents to switch them.",
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
			<LeaderboardPrompt hostUrl={hostUrl} />
			<div className="flex items-center gap-2">
				<span className="ml-auto text-[10px] text-muted-foreground">
					Official quota · refreshes every 5 min
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
					aria-pressed={hideEmails}
					onClick={() => setHideEmails((hidden) => !hidden)}
				>
					{hideEmails ? (
						<LuEye className="size-3" />
					) : (
						<LuEyeOff className="size-3" />
					)}
					{hideEmails ? "Show emails" : "Hide emails"}
				</Button>
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
											selectable={providerAccounts.length > 1}
											hideEmails={hideEmails}
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
