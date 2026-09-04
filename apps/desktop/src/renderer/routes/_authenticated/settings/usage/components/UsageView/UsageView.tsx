import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
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
import { useRestartAgentSessions } from "../../hooks/useRestartAgentSessions";
import { useSetDefaultUsageAccount } from "../../hooks/useSetDefaultUsageAccount";
import { LeaderboardCard } from "../LeaderboardCard";
import { UsageHistorySection } from "../UsageHistorySection";
import type { SwitchSignInTarget } from "./components/AddAccountDialog";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { RemoveAccountDialog } from "./components/RemoveAccountDialog";
import type { RestartSessionsPrompt } from "./components/RestartSessionsDialog";
import { RestartSessionsDialog } from "./components/RestartSessionsDialog";
import { formatResetIn, formatResetLabel } from "./utils/formatResetIn";
import { switchSignInCommand } from "./utils/switchSignInCommand";
import type { ManagedAgent, QuotaAgent } from "./utils/visibleQuotaAgents";
import { isManagedAgent, visibleQuotaAgents } from "./utils/visibleQuotaAgents";

const AGENT_LABELS: Record<QuotaAgent, string> = {
	claude: "Claude Code",
	codex: "Codex",
	grok: "Grok",
	agy: "Antigravity",
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
		const balance = account.creditsBalance.toFixed(2);
		return i18n._(
			msg({
				message: `$${balance} credits`,
			}),
		);
	}
	if (account.extraUsage) {
		const used = (account.extraUsage.usedCents / 100).toFixed(2);
		const limit = (account.extraUsage.limitCents / 100).toFixed(2);
		return i18n._(
			msg({
				message: `extra $${used} of $${limit}`,
			}),
		);
	}
	return null;
}

const DEFAULT_TITLE = msg({
	message:
		"New agent launches use this account. Relaunch a running agent to switch it.",
});

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
	onMakeDefault: (() => void) | null;
	onSwitchSignIn: (() => void) | null;
	/** Null on the system-default card — the main login is never removable. */
	onRemove: (() => void) | null;
	isSwitching: boolean;
	/** True when the agent has several accounts, so the cards read as a
	 * radio group: the default gets a check + accent border, the rest get a
	 * selectable circle. */
	selectable: boolean;
	/** Replaces account emails so screenshots do not retain identifying pixels. */
	hideEmails: boolean;
}) {
	const { t } = useLingui();
	const credits = creditsLine(account);
	const { copyToClipboard, copied } = useCopyToClipboard();
	const expiredCommand =
		account.status === "token_expired"
			? account.agent === "grok"
				? "grok login"
				: account.agent === "agy"
					? "agy"
					: switchSignInCommand(
							account as UsageAccount & { agent: ManagedAgent },
						)
			: null;
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
						<span
							className="shrink-0 self-center"
							title={i18n._(DEFAULT_TITLE)}
						>
							<LuCircleCheck className="size-3.5 text-primary" />
						</span>
					) : (
						<button
							type="button"
							className="shrink-0 self-center text-muted-foreground/50 transition-colors hover:text-primary disabled:pointer-events-none"
							disabled={isSwitching}
							title={t({
								message:
									"Make default — launch new terminals and agents on this account.",
							})}
							onClick={onMakeDefault ?? undefined}
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
					{hideEmails && account.email ? (
						<Trans>Email hidden</Trans>
					) : (
						(account.email ?? AGENT_LABELS[account.agent])
					)}
				</span>
				{account.plan && (
					<span className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
						{account.plan}
					</span>
				)}
				{account.status !== "ok" && (
					<span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-500">
						{account.status === "token_expired" ? (
							<Trans>Sign-in expired</Trans>
						) : account.status === "signed_out" ? (
							<Trans>Signed out</Trans>
						) : (
							<Trans>Unavailable</Trans>
						)}
					</span>
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{/* Source label always shows — it is the only thing that tells two
					    profiles of the same account apart. */}
					{account.sourceLabel}
				</span>
				{(onSwitchSignIn || onRemove) && (
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
							{onSwitchSignIn && (
								<DropdownMenuItem onClick={onSwitchSignIn}>
									<Trans>Switch sign-in…</Trans>
								</DropdownMenuItem>
							)}
							{onRemove && (
								<DropdownMenuItem variant="destructive" onClick={onRemove}>
									<Trans>Remove…</Trans>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			{account.status === "ok" ? (
				<div className="mt-2 flex flex-col gap-1.5">
					{account.windows.map((window) => (
						<QuotaWindowRow key={window.id} window={window} />
					))}
				</div>
			) : expiredCommand !== null ? (
				<div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
					<span>
						<Trans>Sign-in expired — run</Trans>
					</span>
					<button
						type="button"
						className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-muted/70"
						title={expiredCommand}
						onClick={() =>
							copyToClipboard(expiredCommand).catch(() =>
								toast.error(
									t({
										message: "Copy failed",
									}),
									{ description: expiredCommand },
								),
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
					<span>
						<Trans>in a terminal on this host.</Trans>
					</span>
				</div>
			) : (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					{account.statusDetail ?? <Trans>Usage unavailable.</Trans>}
				</div>
			)}
			{/* The radio + accent border already mark the default when the cards
			    read as a group; the footer label only carries it for a lone card. */}
			{((!account.isDefault && onMakeDefault !== null) ||
				(!selectable && account.isDefault) ||
				credits) && (
				<div className="mt-2 flex items-center gap-2 border-t pt-1.5">
					{account.isDefault ? (
						!selectable && (
							<span
								className="inline-flex items-center gap-1 text-[10px] font-medium text-primary"
								title={i18n._(DEFAULT_TITLE)}
							>
								<LuCircleCheck className="size-3" />
								<Trans>Default for new agents</Trans>
							</span>
						)
					) : onMakeDefault ? (
						<Button
							variant="outline"
							size="sm"
							className="h-5 rounded px-1.5 text-[10px]"
							disabled={isSwitching}
							title={i18n._(DEFAULT_TITLE)}
							onClick={onMakeDefault}
						>
							<Trans>Make default</Trans>
						</Button>
					) : null}
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
	const { t } = useLingui();
	const quotaQuery = useHostUsageQuota(hostUrl);
	const setDefault = useSetDefaultUsageAccount(hostUrl);
	const removeAccount = useRemoveUsageAccount(hostUrl);
	const isDark = useIsDarkTheme();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [hideEmails, setHideEmails] = useState(false);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [dialogAgent, setDialogAgent] = useState<ManagedAgent>("claude");
	const [switchTarget, setSwitchTarget] = useState<SwitchSignInTarget | null>(
		null,
	);
	const [removeTarget, setRemoveTarget] = useState<UsageAccount | null>(null);
	const [restartPrompt, setRestartPrompt] =
		useState<RestartSessionsPrompt | null>(null);
	const { countRestartCandidates, restartMutation } =
		useRestartAgentSessions(hostUrl);

	const accounts = quotaQuery.data ?? [];
	const isBusy = quotaQuery.isFetching || isRefreshing;

	const showMadeDefaultToast = (
		providerLabel: string,
		accountLabel: string,
	) => {
		toast.success(
			t({
				message: `New ${providerLabel} agents will use ${accountLabel}.`,
			}),
			{
				description: t({
					message: "Relaunch running agents to switch them.",
				}),
			},
		);
	};

	// Running agents keep the previous account (their PTY env froze at
	// spawn) — after a switch, offer to restart them onto the new one. When
	// the host can't be asked, fall back to the plain toast.
	const handleDefaultSwitched = async (
		agent: ManagedAgent,
		accountLabel: string,
	) => {
		const providerLabel = AGENT_LABELS[agent];
		let candidateCount = 0;
		try {
			candidateCount = await countRestartCandidates(agent);
		} catch {
			// Fall through to the plain toast.
		}
		if (candidateCount > 0) {
			setRestartPrompt({
				agent,
				providerLabel,
				accountLabel,
				count: candidateCount,
			});
			return;
		}
		showMadeDefaultToast(providerLabel, accountLabel);
	};

	const makeDefaultAccount = (account: UsageAccount) => {
		if (!isManagedAgent(account.agent)) return;
		const agent = account.agent;
		setDefault.mutate(
			{ agent, selection: account.selection },
			{
				onSuccess: () => {
					void handleDefaultSwitched(
						agent,
						account.email ?? account.sourceLabel,
					);
				},
				onError: (error) => toast.error(errorMessage(error)),
			},
		);
	};

	const declineRestartSessions = () => {
		if (!restartPrompt) return;
		const { providerLabel, accountLabel } = restartPrompt;
		setRestartPrompt(null);
		showMadeDefaultToast(providerLabel, accountLabel);
	};

	const confirmRestartSessions = () => {
		if (!restartPrompt) return;
		const { agent, accountLabel } = restartPrompt;
		setRestartPrompt(null);
		restartMutation.mutate(
			{ agent },
			{
				onSuccess: () => {
					toast.success(
						t({
							message: `Restarting agents on ${accountLabel}.`,
						}),
						{
							description: t({
								message: "Each session resumes where it left off.",
							}),
						},
					);
				},
				onError: (error) => toast.error(errorMessage(error)),
			},
		);
	};

	const openAddAgentAccount = (agent: ManagedAgent) => {
		setDialogAgent(agent);
		setSwitchTarget(null);
		setIsDialogOpen(true);
	};

	const openSwitchSignIn = (account: UsageAccount) => {
		if (!isManagedAgent(account.agent)) return;
		setDialogAgent(account.agent);
		setSwitchTarget({
			agent: account.agent,
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
			<LeaderboardCard hostUrl={hostUrl} />
			<div className="flex items-center gap-2">
				<span className="ml-auto text-[10px] text-muted-foreground">
					<Trans>Official quota · refreshes every 5 min</Trans>
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
					{hideEmails ? <Trans>Show emails</Trans> : <Trans>Hide emails</Trans>}
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
					<Trans>Reading subscription usage…</Trans>
				</div>
			) : (
				visibleQuotaAgents(accounts).map((agent) => {
					const agentAccounts = accounts.filter(
						(account) => account.agent === agent,
					);
					const icon = getPresetIcon(agent, isDark);
					return (
						<section key={agent} className="flex flex-col gap-1.5">
							<div className="flex items-center gap-1.5">
								{icon && <img src={icon} alt="" className="size-3.5" />}
								<span className="text-xs font-medium">
									{AGENT_LABELS[agent]}
								</span>
								{isManagedAgent(agent) && (
									<Button
										variant="ghost"
										size="sm"
										className="ml-auto h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
										disabled={!hostUrl}
										onClick={() => openAddAgentAccount(agent)}
									>
										<LuPlus className="size-3" />
										<Trans>Add account</Trans>
									</Button>
								)}
							</div>
							{agentAccounts.length === 0 ? (
								<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
									<Trans>
										No {AGENT_LABELS[agent]} logins on this host — sign in and
										usage appears here.
									</Trans>
								</div>
							) : (
								<div className="grid gap-2 md:grid-cols-2">
									{agentAccounts.map((account) => (
										<AccountCard
											key={account.accountKey}
											account={account}
											onMakeDefault={
												isManagedAgent(account.agent)
													? () => makeDefaultAccount(account)
													: null
											}
											onSwitchSignIn={
												isManagedAgent(account.agent)
													? () => openSwitchSignIn(account)
													: null
											}
											onRemove={
												isManagedAgent(account.agent) &&
												account.selection !== null
													? () => setRemoveTarget(account)
													: null
											}
											isSwitching={setDefault.isPending}
											selectable={
												isManagedAgent(agent) && agentAccounts.length > 1
											}
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
					if (
						!removeTarget ||
						removeTarget.selection === null ||
						!isManagedAgent(removeTarget.agent)
					)
						return;
					removeAccount.mutate(
						{
							agent: removeTarget.agent,
							selection: removeTarget.selection,
						},
						{
							onSuccess: () => {
								const removedLabel =
									removeTarget.email ?? removeTarget.sourceLabel;
								toast.success(
									t({
										message: `Removed ${removedLabel}.`,
									}),
								);
								setRemoveTarget(null);
							},
							onError: (error) => toast.error(errorMessage(error)),
						},
					);
				}}
			/>

			<RestartSessionsDialog
				prompt={restartPrompt}
				onDecline={declineRestartSessions}
				onConfirm={confirmRestartSessions}
			/>

			<AddAccountDialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					setIsDialogOpen(open);
					if (!open) setSwitchTarget(null);
				}}
				agent={dialogAgent}
				switchTarget={switchTarget}
				hostUrl={hostUrl}
				onDefaultSwitched={(agent, accountLabel) => {
					void handleDefaultSwitched(agent, accountLabel);
				}}
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
