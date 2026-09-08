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
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useId, useState } from "react";
import {
	LuCheck,
	LuCircle,
	LuCircleCheck,
	LuCopy,
	LuEllipsis,
	LuExternalLink,
	LuEye,
	LuEyeOff,
	LuPlus,
	LuRefreshCw,
	LuTriangleAlert,
} from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { AccountEngineAgentSettings } from "../../hooks/useAccountEngineSettings";
import { useAccountEngineSettings } from "../../hooks/useAccountEngineSettings";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "../../hooks/useHostUsageQuota";
import { useHostUsageQuota } from "../../hooks/useHostUsageQuota";
import { usePinnedAgentSessions } from "../../hooks/usePinnedAgentSessions";
import { useRemoveUsageAccount } from "../../hooks/useRemoveUsageAccount";
import { useSetAccountEngineSettings } from "../../hooks/useSetAccountEngineSettings";
import { useSetAccountRotation } from "../../hooks/useSetAccountRotation";
import { useSetDefaultUsageAccount } from "../../hooks/useSetDefaultUsageAccount";
import { useSwitchHistory } from "../../hooks/useSwitchHistory";
import { rotationKey } from "../../utils/rotationKey";
import { LeaderboardCard } from "../LeaderboardCard";
import { UsageHistorySection } from "../UsageHistorySection";
import type { SwitchSignInTarget } from "./components/AddAccountDialog";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { AutoSwitchSettings } from "./components/AutoSwitchSettings";
import { RemoveAccountDialog } from "./components/RemoveAccountDialog";
import type { RestartSessionsPrompt } from "./components/RestartSessionsDialog";
import { RestartSessionsDialog } from "./components/RestartSessionsDialog";
import { SwitchHistory } from "./components/SwitchHistory";
import { API_BILLING_LINKS } from "./utils/apiBilling";
import {
	engineErrorCode,
	engineErrorMessage,
} from "./utils/engineErrorMessage";
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

/**
 * What the switch really does to the sessions already running, per agent. A
 * Claude session on the shared active login reads it again on its next turn,
 * so it needs no relaunch; one launched from its own profile dir does, and
 * every Codex session does — its account *is* its config dir. The engine
 * restarts those with resume the moment they are between turns
 * (`SessionMover.moveAtIdle`), so the confirmation must not promise that
 * nothing is relaunched.
 */
export function sessionMoveNote(
	agent: ManagedAgent,
	/**
	 * KTD13. Absent means the host has not said otherwise, so the POSIX
	 * promise stands: only a host that answered `platformSupported: false`
	 * loses the live swap, and a read that has not landed must not send a
	 * macOS user off to relaunch.
	 */
	movesRunningSessions = true,
): string {
	// win32: `usage.setDefaultAccount` writes only the default-account
	// pointer, which agents read at launch, so the sessions already running
	// keep the previous login until they are restarted by hand.
	if (!movesRunningSessions) {
		return i18n._(
			msg({
				message:
					"New sessions use it; sessions already running keep the previous login until you restart them.",
			}),
		);
	}
	return agent === "claude"
		? i18n._(
				msg({
					message:
						"Running sessions pick up the new login in place; ones on their own profile restart when they go idle.",
				}),
			)
		: i18n._(
				msg({
					message:
						"Running sessions move over when they go idle, resuming where they left off.",
				}),
			);
}

function canAutomaticallySwitch(account: UsageAccount): boolean {
	return (
		account.credentialKind === "subscription" &&
		(account.status === "ok" || account.status === "token_stale")
	);
}

/**
 * How many of an agent's accounts the engine could actually switch onto.
 * Mirrors what `shouldSwitch` looks for: another account than the active one
 * (`accountKey !== active.accountKey`) that `isEligible` accepts — managed, in
 * rotation, and with a token it can read. Login count is not the predicate:
 * two logins with neither in rotation are as inert as one.
 */
function switchCandidateCount(accounts: UsageAccount[]): number {
	return accounts.filter(
		(candidate) =>
			!candidate.isDefault &&
			candidate.managed &&
			candidate.inRotation &&
			canAutomaticallySwitch(candidate),
	).length;
}

const ACTIVE_TITLE = msg({
	message:
		"Active — every running and newly launched session of this agent uses this account.",
});

/** The same title where the switch reaches new launches only (KTD13). */
const ACTIVE_TITLE_NEW_SESSIONS_ONLY = msg({
	message:
		"Active — every newly launched session of this agent uses this account; ones already running keep the previous login until you restart them.",
});

export function AccountCard({
	account,
	onMakeActive: makeActive,
	onToggleRotation: toggleRotation,
	onSwitchSignIn: switchSignIn,
	onRemove: remove,
	isActivating,
	isSwitching,
	error,
	selectable,
	hideEmails,
	movesRunningSessions = true,
}: {
	account: UsageAccount;
	onMakeActive: (() => void) | null;
	/** R16. Null on agents the engine cannot switch. */
	onToggleRotation: ((inRotation: boolean) => void) | null;
	onSwitchSignIn: (() => void) | null;
	/** Null on the system-default card — the main login is never removable. */
	onRemove: (() => void) | null;
	/** This card's own switch is waiting on the host. */
	isActivating: boolean;
	/** Some switch is in flight, so no card may start another. */
	isSwitching: boolean;
	/** A refusal to act on, shown on the card that asked for it. */
	error: string | null;
	/** True when the agent has several accounts, so the cards read as a
	 * radio group: the active one gets a check + accent border, the rest get a
	 * selectable circle. */
	selectable: boolean;
	/** Replaces account emails so screenshots do not retain identifying pixels. */
	hideEmails: boolean;
	/** False once the host has said the switch reaches new launches only
	 * (KTD13, win32). Absent means it has not said so, so the promise stands. */
	movesRunningSessions?: boolean;
}) {
	const { t } = useLingui();
	const rotationId = useId();
	const activeTitle = i18n._(
		movesRunningSessions ? ACTIVE_TITLE : ACTIVE_TITLE_NEW_SESSIONS_ONLY,
	);
	// A login set up outside Superset is ours to read, never to write — the
	// engine refuses it as a switch target for the same reason — so the card
	// offers no way to switch onto it, to put it in rotation, to sign it in
	// again, or to delete its directory. The "Unmanaged" badge and the line
	// under the card say why.
	const onMakeActive = account.managed ? makeActive : null;
	const onToggleRotation = account.managed ? toggleRotation : null;
	const rotationEligible = canAutomaticallySwitch(account);
	const onSwitchSignIn = account.managed ? switchSignIn : null;
	const onRemove = account.managed ? remove : null;
	// Grok and Antigravity keep one login per machine, so "unmanaged" would be
	// on every card of theirs and would warn about a switch that never existed.
	const showsUnmanaged = !account.managed && isManagedAgent(account.agent);
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
						<span className="shrink-0 self-center" title={activeTitle}>
							<LuCircleCheck className="size-3.5 text-primary" />
						</span>
					) : onMakeActive ? (
						<button
							type="button"
							className="shrink-0 self-center text-muted-foreground/50 transition-colors hover:text-primary disabled:pointer-events-none"
							disabled={isSwitching}
							title={
								movesRunningSessions
									? t({
											message:
												"Make active — running sessions move to this account too.",
										})
									: t({
											message:
												"Make active — sessions launched from now on use this account.",
										})
							}
							onClick={onMakeActive}
						>
							<LuCircle className="size-3.5" />
						</button>
					) : null)}
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
				{account.credentialKind === "api_key" && (
					<span className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
						<Trans>API</Trans>
					</span>
				)}
				{account.status === "token_stale" && (
					<span
						className="whitespace-nowrap rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground"
						title={t({
							message:
								"The access token is past its expiry but the sign-in is not — a fresh one is minted the next time the CLI runs.",
						})}
					>
						<Trans>Stale token, still eligible</Trans>
					</span>
				)}
				{showsUnmanaged && (
					<span
						className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
						title={t({
							message:
								"Set up outside Superset. Its usage is shown, but switching never writes to this login.",
						})}
					>
						<Trans>Unmanaged</Trans>
					</span>
				)}
				{account.status !== "ok" && account.status !== "token_stale" && (
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
			{account.credentialKind === "api_key" ? (
				// Pay-per-token billing has no quota windows; point at the
				// provider's own usage page instead.
				<div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
					<span className="truncate">
						<Trans>Billed per token.</Trans>
					</span>
					{isManagedAgent(account.agent) && (
						<a
							href={API_BILLING_LINKS[account.agent].usage}
							target="_blank"
							rel="noopener noreferrer"
							className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap hover:text-foreground hover:underline"
						>
							<Trans>View usage</Trans>
							<LuExternalLink className="size-2.5" />
						</a>
					)}
				</div>
			) : account.status === "ok" ? (
				<div className="mt-2 flex flex-col gap-1.5">
					{account.windows.map((window) => (
						<QuotaWindowRow key={window.id} window={window} />
					))}
				</div>
			) : account.status === "token_stale" ? (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					<Trans>Refreshes when Claude Code next runs.</Trans>
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
			{/* One card per agent says "Active" in words — the accent border and
			    radio only rank the cards against each other. */}
			{(account.isDefault ||
				onMakeActive !== null ||
				onToggleRotation !== null ||
				credits) && (
				<div className="mt-2 flex items-center gap-2 border-t pt-1.5">
					{account.isDefault ? (
						<span
							className="inline-flex items-center gap-1 text-[10px] font-medium text-primary"
							title={activeTitle}
						>
							<LuCircleCheck className="size-3" />
							<Trans context="account state">Active</Trans>
						</span>
					) : onMakeActive ? (
						<Button
							variant="outline"
							size="sm"
							className="h-5 rounded px-1.5 text-[10px]"
							disabled={isSwitching}
							title={activeTitle}
							onClick={onMakeActive}
						>
							{isActivating ? (
								<Trans>Switching…</Trans>
							) : (
								<Trans>Make active</Trans>
							)}
						</Button>
					) : null}
					{onToggleRotation && (
						<label
							htmlFor={rotationId}
							className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground"
							title={
								rotationEligible
									? t({
											message:
												"Automatic switching may move sessions onto this account. Held-out accounts stay available to pick by hand.",
										})
									: undefined
							}
						>
							<Trans>In rotation</Trans>
							<Switch
								id={rotationId}
								className="h-3.5 w-6 [&>[data-slot=switch-thumb]]:size-3"
								aria-label={t({
									message: "In rotation",
								})}
								checked={rotationEligible && account.inRotation}
								disabled={!rotationEligible}
								onCheckedChange={onToggleRotation}
							/>
						</label>
					)}
					{credits && (
						<span
							className={cn(
								"text-[10px] text-muted-foreground tabular-nums",
								!onToggleRotation && "ml-auto",
							)}
						>
							{credits}
						</span>
					)}
				</div>
			)}
			{showsUnmanaged && (
				<p className="mt-1.5 text-[10px] text-muted-foreground">
					<Trans>
						Signed in outside Superset, so switching leaves this login alone.
					</Trans>
				</p>
			)}
			{error !== null && (
				<p
					role="alert"
					className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-500"
				>
					<LuTriangleAlert className="mt-px size-3 shrink-0" />
					<span>{error}</span>
				</p>
			)}
		</div>
	);
}

export function UsageView({ hostUrl }: { hostUrl: string | null }) {
	const { t } = useLingui();
	const quotaQuery = useHostUsageQuota(hostUrl);
	const setDefault = useSetDefaultUsageAccount(hostUrl);
	const removeAccount = useRemoveUsageAccount(hostUrl);
	const engineQuery = useAccountEngineSettings(hostUrl);
	const setEngineSettings = useSetAccountEngineSettings(hostUrl);
	const setRotation = useSetAccountRotation(hostUrl);
	const historyQuery = useSwitchHistory(hostUrl);
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
	// Keyed by what the refusal is actually about, so a card keeps its own
	// when several cards are touched in a row. A switch refusal belongs to the
	// run target that asked for it, which is the card, so it is filed under the
	// unique `accountKey`. A rotation refusal belongs to the rotation flag, and
	// two cards of one provider account share one flag, so it is filed under
	// `rotationKey` and belongs on both.
	const [cardErrors, setCardErrors] = useState<
		Record<string, { kind: "switch" | "rotation"; message: string }>
	>({});
	const [activatingKey, setActivatingKey] = useState<string | null>(null);
	const { countPinnedSessions } = usePinnedAgentSessions(hostUrl);

	const accounts = quotaQuery.data ?? [];
	const isBusy = quotaQuery.isFetching || isRefreshing;
	// No panel until the host has described its engine once — a placeholder
	// with invented defaults would be a settings screen that lies.
	const engineAgentSettings: Record<
		ManagedAgent,
		AccountEngineAgentSettings
	> | null = engineQuery.data?.settings ?? null;
	// KTD13: on win32 the host writes only the default-account pointer, which
	// agents read at launch, and its own comment says "Only the swap of
	// already-running sessions is lost" — yet the mutation still resolves
	// success, so every line promising the live swap has to know. `!== false`
	// and not `?? false`: a read that has not landed is not a Windows host,
	// and telling everyone else to relaunch would be its own falsehood.
	const movesRunningSessions = engineQuery.data?.platformSupported !== false;
	// The three states in which `AutoSwitchSettings` replaces its controls with
	// an explanation of why nothing can switch at all. A note about this
	// agent's accounts underneath one of those would be noise.
	const autoSwitchBlocked =
		!engineQuery.data?.platformSupported ||
		!engineQuery.data?.engineAvailable ||
		!engineQuery.data?.lockOwner;

	const showMadeActiveToast = (agent: ManagedAgent, accountLabel: string) => {
		const providerLabel = AGENT_LABELS[agent];
		toast.success(
			t({
				message: `${accountLabel} is now the active ${providerLabel} account.`,
			}),
			{ description: sessionMoveNote(agent, movesRunningSessions) },
		);
	};

	/** Whatever the host refused with, said in words the user can act on. */
	const switchFailureMessage = (failure: unknown): string =>
		engineErrorMessage(failure) ??
		t({
			message: `Switch failed (${engineErrorCode(failure)}). The previous account is still active.`,
		});

	const setCardError = (
		key: string,
		kind: "switch" | "rotation",
		message: string | null,
	) => {
		setCardErrors((errors) => {
			if (message === null) {
				if (!(key in errors)) return errors;
				const { [key]: _cleared, ...rest } = errors;
				return rest;
			}
			return { ...errors, [key]: { kind, message } };
		});
	};

	/** The refusal this card is the one to show, under either spelling. */
	const cardErrorFor = (account: UsageAccount): string | null => {
		const own = cardErrors[account.accountKey];
		if (own?.kind === "switch") return own.message;
		const rotation = cardErrors[rotationKey(account)];
		if (rotation?.kind === "rotation") return rotation.message;
		return null;
	};

	// A refusal says "the previous account is still active", so a switch that
	// then succeeds makes it false. Only this agent's cards are cleared —
	// another agent's refusal is about a switch this one did not perform. A
	// rotation refusal says nothing about the active account, so it stays: the
	// toggle it rolled back is still off the way the user did not ask for.
	const clearAgentCardErrors = (agent: ManagedAgent) => {
		const switched = new Set(
			accounts
				.filter((candidate) => candidate.agent === agent)
				.map((candidate) => candidate.accountKey),
		);
		setCardErrors((errors) => {
			const kept = Object.entries(errors).filter(
				([key, entry]) => !(entry.kind === "switch" && switched.has(key)),
			);
			if (kept.length === Object.keys(errors).length) return errors;
			return Object.fromEntries(kept);
		});
	};

	// Sessions pinned to their own config dir by their agent configuration
	// never move: that env wins over the host default at launch, so no
	// relaunch would reach them — say so instead of promising otherwise.
	// When the host can't be asked, fall back to the plain toast.
	// Every successful switch lands here, so it is also where the refusals it
	// just made untrue are dropped.
	const handleDefaultSwitched = async (
		agent: ManagedAgent,
		accountLabel: string,
	) => {
		clearAgentCardErrors(agent);
		const providerLabel = AGENT_LABELS[agent];
		let candidateCount = 0;
		try {
			candidateCount = await countPinnedSessions(agent);
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
		showMadeActiveToast(agent, accountLabel);
	};

	// R2/F3: the host performs the switch, so a failure must leave the
	// indicator where it was and say so on the card that asked.
	const makeAccountActive = (account: UsageAccount) => {
		if (!isManagedAgent(account.agent)) return;
		const agent = account.agent;
		// The card's own key, not the rotation key: two run targets can share
		// one provider account, and only the one that asked is switching.
		const key = account.accountKey;
		setCardError(key, "switch", null);
		setActivatingKey(key);
		setDefault.mutate(
			{ agent, selection: account.selection },
			{
				onSuccess: () => {
					setActivatingKey(null);
					void handleDefaultSwitched(
						agent,
						account.email ?? account.sourceLabel,
					);
				},
				onError: (failure) => {
					setActivatingKey(null);
					setCardError(key, "switch", switchFailureMessage(failure));
				},
			},
		);
	};

	// One mutation instance serves every row, so a toggle elsewhere detaches
	// this call from it and its per-call `onError` never runs — the toggle
	// sprang back with nothing on screen to say why. The mutation's own promise
	// still rejects with the refusal, so the report is taken from there.
	const toggleAccountRotation = async (
		account: UsageAccount,
		inRotation: boolean,
	) => {
		const key = rotationKey(account);
		setCardError(key, "rotation", null);
		try {
			await setRotation.mutateAsync({ accountKey: key, inRotation });
		} catch (failure) {
			setCardError(
				key,
				"rotation",
				engineErrorMessage(failure) ??
					t({
						message: `Rotation not saved (${engineErrorCode(failure)}).`,
					}),
			);
		}
	};

	// The switch itself succeeded; the confirmation waits for the notice so
	// the two never contradict each other on screen at once.
	const dismissRestartPrompt = () => {
		if (!restartPrompt) return;
		const { agent, accountLabel } = restartPrompt;
		setRestartPrompt(null);
		showMadeActiveToast(agent, accountLabel);
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
			credentialKind: account.credentialKind,
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

			{/* Sections render before the first quota read lands so Add account is
			    reachable straight away; each shows its own placeholder meanwhile. */}
			{visibleQuotaAgents(accounts).map((agent) => {
				const agentAccounts = accounts.filter(
					(account) => account.agent === agent,
				);
				const icon = getPresetIcon(agent, isDark);
				return (
					<section key={agent} className="flex flex-col gap-1.5">
						<div className="flex items-center gap-1.5">
							{icon && <img src={icon} alt="" className="size-3.5" />}
							<span className="text-xs font-medium">{AGENT_LABELS[agent]}</span>
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
						{isManagedAgent(agent) && (
							<p className="text-[10px] text-muted-foreground">
								{movesRunningSessions ? (
									<Trans>
										Every running and newly launched {AGENT_LABELS[agent]}{" "}
										session uses the active account.
									</Trans>
								) : (
									<Trans>
										Newly launched {AGENT_LABELS[agent]} sessions use the active
										account; ones already running keep the previous login until
										you restart them.
									</Trans>
								)}
							</p>
						)}
						{quotaQuery.isPending ? (
							<div className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
								<LuRefreshCw className="size-3 animate-spin" />
								<Trans>Reading usage…</Trans>
							</div>
						) : agentAccounts.length === 0 ? (
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
										onMakeActive={
											isManagedAgent(account.agent)
												? () => makeAccountActive(account)
												: null
										}
										onToggleRotation={
											isManagedAgent(account.agent)
												? (inRotation) => {
														void toggleAccountRotation(account, inRotation);
													}
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
										isActivating={activatingKey === account.accountKey}
										isSwitching={setDefault.isPending}
										error={cardErrorFor(account)}
										selectable={
											isManagedAgent(agent) && agentAccounts.length > 1
										}
										hideEmails={hideEmails}
										movesRunningSessions={movesRunningSessions}
									/>
								))}
							</div>
						)}
						{engineAgentSettings && isManagedAgent(agent) && (
							<>
								<AutoSwitchSettings
									agentLabel={AGENT_LABELS[agent]}
									settings={engineAgentSettings[agent]}
									engineAvailable={engineQuery.data?.engineAvailable ?? false}
									platformSupported={
										engineQuery.data?.platformSupported ?? false
									}
									lockOwner={engineQuery.data?.lockOwner ?? false}
									disabled={!hostUrl || engineQuery.isPending}
									onCommit={(patch) =>
										setEngineSettings.mutateAsync({ agent, patch })
									}
								/>
								{/* The panel offers a switch the engine can never make: it
								    finds no candidate, and the only word about it comes as
								    an exhaustion notice much later. The setting is
								    legitimately configured before the second account
								    exists, so this says so rather than hiding the panel. */}
								{!autoSwitchBlocked &&
									switchCandidateCount(agentAccounts) === 0 && (
										<p className="px-2.5 text-[11px] text-muted-foreground">
											<Trans>
												Nothing to switch to yet: this needs another{" "}
												{AGENT_LABELS[agent]} account with In rotation turned
												on.
											</Trans>
										</p>
									)}
							</>
						)}
					</section>
				);
			})}

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
							onError: (error) =>
								toast.error(engineErrorMessage(error) ?? errorMessage(error)),
						},
					);
				}}
			/>

			<RestartSessionsDialog
				prompt={restartPrompt}
				onDismiss={dismissRestartPrompt}
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

			<SwitchHistory
				entries={historyQuery.data?.entries ?? []}
				// A disabled query stays pending, so with no host this is still
				// "not read yet" — the same state the quota sections above show as
				// "Reading usage…". Gating it on `hostUrl` turned it into an empty
				// table claiming no switch ever happened.
				isLoading={historyQuery.isPending}
				isError={historyQuery.isError}
				agentLabels={{ claude: AGENT_LABELS.claude, codex: AGENT_LABELS.codex }}
				hideEmails={hideEmails}
			/>

			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
