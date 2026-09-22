import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate, formatPercent } from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CircleHelp, Loader2, Zap } from "lucide-react";
import { useState } from "react";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useNow } from "renderer/hooks/useNow";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import { UsageProgressRing } from "./components/UsageProgressRing";
import { getAccountUsageState } from "./utils/getAccountUsageState";

interface TerminalAccountUsageProps {
	workspaceId: string;
	terminalId: string;
}

export function TerminalAccountUsage({
	workspaceId,
	terminalId,
}: TerminalAccountUsageProps) {
	const { t } = useLingui();
	const [openSession, setOpenSession] = useState<string | null>(null);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const sessionKey = `${hostUrl}:${terminalId}:${binding?.startedAt}:${binding?.agentSessionId}`;
	const open = openSession === sessionKey;
	const setOpen = (value: boolean) => setOpenSession(value ? sessionKey : null);
	const supported =
		binding?.agentId === "claude" || binding?.agentId === "codex";
	const quota = useHostUsageQuota(binding && supported ? hostUrl : null);
	const identity = useQuery({
		queryKey: [
			"session-usage-account",
			hostUrl,
			workspaceId,
			terminalId,
			binding?.startedAt,
			binding?.agentSessionId,
			binding?.launchId,
		],
		enabled: !!hostUrl && !!binding && supported,
		queryFn: () =>
			hostUrl && binding
				? getHostServiceClientByUrl(hostUrl).usage.sessionAccount.query({
						workspaceId,
						terminalId,
						startedAt: binding.startedAt,
					})
				: null,
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const now = useNow(30_000);
	if (!binding) return null;
	const { account, state, tightest } = getAccountUsageState({
		supported,
		identity: identity.isError ? null : identity.data,
		accounts: quota.data ?? [],
		loading: supported && (identity.isPending || quota.isPending),
		failed: quota.isError,
		now: now.getTime(),
	});
	const status =
		state === "loading"
			? t({ message: "Reading usage…" })
			: state === "api"
				? t({ message: "API billing" })
				: state === "unverified"
					? t({ message: "Login unverified" })
					: state === "stale"
						? t({ message: "Usage is out of date" })
						: state === "unavailable"
							? t({ message: "Usage unavailable." })
							: null;
	const percent = tightest ? formatPercent(tightest.usedPercent / 100) : "";
	const summary = status ?? t({ message: `${percent} used` });
	const title = t({ message: "Account usage" });
	const Icon =
		state === "loading" ? Loader2 : state === "api" ? Zap : CircleHelp;
	const severity = state === "ready" && tightest ? tightest.usedPercent : 0;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip open={open ? false : undefined}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							data-testid="pane-account-usage"
							aria-label={`${title}: ${summary}`}
							className={cn(
								"flex size-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								open && "bg-secondary",
								severity >= 90
									? "text-red-500 hover:text-red-500"
									: severity >= 70
										? "text-amber-500 hover:text-amber-500"
										: "text-muted-foreground/60 hover:text-muted-foreground",
							)}
						>
							{state === "ready" && tightest ? (
								<UsageProgressRing usedPercent={tightest.usedPercent} />
							) : state === "stale" || state === "unavailable" ? (
								<UsageProgressRing unavailable />
							) : (
								<Icon
									aria-hidden
									className={cn(
										"size-4",
										state === "loading" && "animate-spin",
									)}
								/>
							)}
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p>{title}</p>
					<p>
						{tightest && !status ? `${tightest.label} · ${summary}` : summary}
					</p>
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				side="bottom"
				align="end"
				className="w-80 max-w-[calc(100vw-24px)]"
				aria-label={title}
			>
				<h2 className="text-sm font-medium">{title}</h2>
				<p className="mt-2 truncate text-xs">
					{account?.email ?? AGENT_IDENTITY_LABELS[binding.agentId]}
				</p>
				{account?.plan && (
					<p className="text-[11px] text-muted-foreground">{account.plan}</p>
				)}
				{status && (
					<p className="mt-3 text-xs text-muted-foreground">{status}</p>
				)}
				{(state === "ready" || state === "stale") &&
					account?.windows.map((window) => {
						const used = formatPercent(window.usedPercent / 100);
						return (
							<div key={window.id} className="mt-4">
								<div className="flex justify-between gap-3 text-xs">
									<span>{window.label}</span>
									<span className="shrink-0 tabular-nums">
										<Trans>{used} used</Trans>
									</span>
								</div>
								<div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
									<div
										className={cn(
											"h-full rounded-full",
											state === "stale"
												? "bg-muted-foreground"
												: window.usedPercent >= 90
													? "bg-red-500"
													: window.usedPercent >= 70
														? "bg-amber-500"
														: "bg-primary",
										)}
										style={{
											width: `${Math.min(100, Math.max(0, window.usedPercent))}%`,
										}}
									/>
								</div>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{window.resetsAt &&
									new Date(window.resetsAt).getTime() > now.getTime() ? (
										formatResetLabel(new Date(window.resetsAt), now)
									) : (
										<Trans>Reset time unavailable</Trans>
									)}
								</p>
							</div>
						);
					})}
				{account?.credentialKind === "subscription" && (
					<p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
						<Trans>Shared across sessions using this login.</Trans>
					</p>
				)}
				<div className="mt-3 flex items-center justify-between gap-3">
					<span className="text-[10px] text-muted-foreground">
						{account &&
							(() => {
								const date = formatDate(new Date(account.fetchedAt), {
									hour: "numeric",
									minute: "2-digit",
								});
								return t({ message: `Updated ${date}` });
							})()}
					</span>
					<Link
						to="/settings/usage"
						search={{
							workspaceId,
							accountKey: account?.accountKey,
							agent: binding.agentId,
						}}
						onClick={() => setOpen(false)}
						className="inline-flex items-center gap-1 text-xs hover:underline"
					>
						<Trans>View usage</Trans>
						<ArrowUpRight className="size-3" />
					</Link>
				</div>
			</PopoverContent>
		</Popover>
	);
}
