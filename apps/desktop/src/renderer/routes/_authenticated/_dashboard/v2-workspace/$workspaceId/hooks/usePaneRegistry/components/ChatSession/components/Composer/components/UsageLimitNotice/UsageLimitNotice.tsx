import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { UsageLimit, UsageLimitAction } from "@superset/chat/protocol";
import { formatPercent } from "@superset/i18n/format";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useRouter } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Check,
	ChevronDown,
	Clock,
	Gauge,
	Play,
	UserRound,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type UsageAccount,
	useHostUsageQuota,
} from "renderer/hooks/host-service/useHostUsageQuota";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useSetDefaultUsageAccount } from "renderer/routes/_authenticated/settings/usage/hooks/useSetDefaultUsageAccount";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "../../constants";

const TICK_MS = 30_000;
const CLOSE_TICK_MS = 5_000;
const CLOSE_MS = 2 * 60_000;

/** The provider's window names, as a reader knows them. */
const TITLES: Record<string, ReturnType<typeof msg>> = {
	five_hour: msg({ message: "5-hour limit reached" }),
	seven_day: msg({ message: "Weekly limit reached" }),
	seven_day_opus: msg({ message: "Weekly Opus limit reached" }),
	seven_day_sonnet: msg({ message: "Weekly Sonnet limit reached" }),
	seven_day_overage_included: msg({ message: "Extra usage limit reached" }),
	overage: msg({ message: "Extra usage limit reached" }),
};

export type SwitchableAgent = "claude" | "codex";
export type SwitchAccount = (
	setAccount: () => Promise<unknown>,
) => Promise<void>;

/**
 * The provider refused the last turn for the account's usage. One line says
 * which limit, for which model, on which account, and when it reopens; the
 * controls offer to continue now or at the reset, to move the chat to
 * another login the host knows, or to look at usage.
 */
export function UsageLimitNotice({
	agent,
	hostUrl,
	limit,
	modelLabel,
	sessionAccount,
	onRespond,
	onSwitchAccount,
}: {
	sessionAccount?: TerminalAgentBinding["account"];
	limit: UsageLimit;
	onRespond: (action: UsageLimitAction) => void;
	/** The model's name as the agent lists it; the id when it does not. */
	modelLabel?: string | undefined;
	/** Which agent's logins the host can switch between; others cannot. */
	agent?: SwitchableAgent | undefined;
	hostUrl?: string | null | undefined;
	onSwitchAccount?: SwitchAccount | undefined;
}) {
	const { i18n, t } = useLingui();
	const [now, setNow] = useState(() => Date.now());
	const resetsAtMs = limit.resetsAtMs;
	const waiting = resetsAtMs !== undefined && resetsAtMs > now;
	// Near the reset the countdown is in minutes, so the tick keeps up.
	const close = waiting && resetsAtMs - now < CLOSE_MS;
	useEffect(() => {
		if (!waiting) return;
		const timer = window.setInterval(
			() => setNow(Date.now()),
			close ? CLOSE_TICK_MS : TICK_MS,
		);
		return () => window.clearInterval(timer);
	}, [waiting, close]);

	const quota = useHostUsageQuota(agent && hostUrl ? hostUrl : null);
	const accounts = (quota.data ?? []).filter(
		(account) => account.agent === agent,
	);
	const current = accounts.find(
		(account) =>
			account.agent === sessionAccount?.agent &&
			account.selection === sessionAccount.selection &&
			account.credentialKind === sessionAccount.credentialKind,
	);
	const title = limit.window ? TITLES[limit.window] : undefined;
	const detail = [
		modelLabel,
		resetsAtMs === undefined
			? undefined
			: waiting
				? formatResetLabel(new Date(resetsAtMs), new Date(now))
				: t({ message: "Limit has reset" }),
	]
		.filter((part): part is string => Boolean(part))
		.join(" · ");

	return (
		<output
			className="mx-4 flex items-center gap-3 rounded-t-2xl border border-border/60 border-b-0 bg-muted/40 py-2 pr-2 pl-3"
			data-usage-limit
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-400">
				<Gauge className="size-4" />
			</span>
			<div className="min-w-0 flex-1 font-sans">
				<div className="truncate font-medium text-[13px] text-foreground">
					{title ? i18n._(title) : <Trans>Usage limit reached</Trans>}
				</div>
				{detail && (
					<div className="truncate text-[12px] text-muted-foreground">
						{detail}
					</div>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-0.5">
				{agent && (
					<AccountMenu
						accounts={accounts}
						agent={agent}
						current={current}
						email={sessionAccount?.email}
						hostUrl={hostUrl ?? null}
						onSwitch={onSwitchAccount}
					/>
				)}
				{!waiting ? (
					<button
						className={PILL_TRIGGER_CLASS}
						onClick={() => onRespond("resume")}
						type="button"
					>
						<Play className="size-3.5" />
						<Trans>Resume</Trans>
					</button>
				) : limit.resumeAtReset ? (
					<button
						className={cn(
							PILL_TRIGGER_CLASS,
							"bg-amber-400/10 text-amber-400 hover:bg-amber-400/15 hover:text-amber-300",
						)}
						onClick={() => onRespond("cancel_resume_at_reset")}
						title={t({ message: "Cancel the automatic resume" })}
						type="button"
					>
						<Clock className="size-3.5" />
						<Trans>Resuming at reset</Trans>
					</button>
				) : (
					<button
						className={PILL_TRIGGER_CLASS}
						onClick={() => onRespond("resume_at_reset")}
						title={t({ message: "Continue this chat once the limit resets" })}
						type="button"
					>
						<Clock className="size-3.5" />
						<Trans>Resume at reset</Trans>
					</button>
				)}
				<button
					aria-label={t({ message: "Dismiss the usage limit notice" })}
					className={cn(PILL_TRIGGER_CLASS, "px-1.5")}
					onClick={() => onRespond("dismiss")}
					type="button"
				>
					<X className="size-3.5" />
				</button>
			</div>
		</output>
	);
}

/** The window nearest to full, which is the one that bites first. */
function tightest(account: UsageAccount) {
	return account.windows.reduce<UsageAccount["windows"][number] | null>(
		(best, candidate) =>
			best === null || candidate.usedPercent > best.usedPercent
				? candidate
				: best,
		null,
	);
}

function AccountMenu({
	accounts,
	agent,
	current,
	email,
	hostUrl,
	onSwitch,
}: {
	accounts: UsageAccount[];
	agent: SwitchableAgent;
	current: UsageAccount | undefined;
	email: string | undefined;
	hostUrl: string | null;
	onSwitch: SwitchAccount | undefined;
}) {
	const { t } = useLingui();
	const router = useRouter({ warn: false });
	const setDefault = useSetDefaultUsageAccount(hostUrl);
	const openUsage = () => void router?.navigate({ to: "/settings/usage" });
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					aria-label={t({ message: "Switch account" })}
					className={cn(PILL_TRIGGER_CLASS, "group max-w-56")}
					title={email ?? current?.email ?? undefined}
					type="button"
				>
					<UserRound className="size-3.5 shrink-0" />
					<span className="truncate">
						{email ?? current?.email ?? current?.sourceLabel ?? (
							<Trans>Account</Trans>
						)}
					</span>
					<ChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className={cn(MENU_PANEL_CLASS, "w-[280px] p-1")}
				side="top"
			>
				{accounts.length > 1 && (
					<DropdownMenuLabel className="px-2 py-1.5 font-normal text-[11px] text-muted-foreground">
						<Trans>Continue this chat on another login</Trans>
					</DropdownMenuLabel>
				)}
				{accounts.map((account) => {
					const isCurrent = account === current;
					const window = tightest(account);
					return (
						<DropdownMenuItem
							className={cn(MENU_ROW_CLASS, "h-auto items-center py-1.5")}
							disabled={isCurrent || setDefault.isPending || !onSwitch}
							key={account.accountKey}
							onSelect={() => {
								void onSwitch?.(() =>
									setDefault.mutateAsync({
										agent,
										selection: account.selection,
									}),
								);
							}}
						>
							<span className="flex size-3.5 shrink-0 items-center justify-center">
								{isCurrent && <Check className="size-3.5" />}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate">
									{account.email ?? account.sourceLabel}
								</span>
								<span className="block truncate text-[11px] text-muted-foreground">
									{[
										account.plan,
										window
											? t({
													message: `${window.label} · ${formatPercent(window.usedPercent / 100)} used`,
												})
											: undefined,
									]
										.filter(Boolean)
										.join(" · ")}
								</span>
							</span>
						</DropdownMenuItem>
					);
				})}
				{accounts.length > 0 && <DropdownMenuSeparator />}
				<DropdownMenuItem className={MENU_ROW_CLASS} onSelect={openUsage}>
					<ArrowUpRight className="size-3.5" />
					{accounts.length > 1 ? (
						<Trans>Usage settings</Trans>
					) : (
						<Trans>Add an account in Usage settings</Trans>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
