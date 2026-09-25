import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { useEffect, useId, useRef, useState } from "react";
import {
	LuArrowLeft,
	LuCheck,
	LuCopy,
	LuLoaderCircle,
	LuTerminal,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { CommandTerminal } from "renderer/routes/_authenticated/components/CommandTerminal";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import type { UsageLogins } from "../../../../hooks/useHostUsageLogins";
import { useHostUsageLogins } from "../../../../hooks/useHostUsageLogins";
import { useSetDefaultUsageAccount } from "../../../../hooks/useSetDefaultUsageAccount";
import { addAccountCommand } from "../../utils/addAccountCommand";
import type { AccountCredentialKind } from "../../utils/apiBilling";
import {
	type FoundLogin,
	findCompletedLogin,
} from "../../utils/findCompletedLogin";
import { switchSignInCommand } from "../../utils/switchSignInCommand";
import type { ManagedAgent } from "../../utils/visibleQuotaAgents";

type Agent = ManagedAgent;

const AGENT_LABELS: Record<Agent, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

/** The login being re-signed by "Switch sign-in": a profile dir, or the
 * system default when selection is null. */
export interface SwitchSignInTarget {
	agent: Agent;
	credentialKind: AccountCredentialKind;
	selection: string | null;
	/** Display name for the dialog copy ("~/.claude-2", an email, …). */
	label: string;
}

function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "work"
	);
}

interface AddAccountDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hostUrl: string | null;
	/** Agent being added; the per-agent Add buttons preselect it. */
	agent: Agent;
	/** Called once when the new sign-in is detected, to refresh quota. */
	onAccountAdded: () => void;
	/** Called after "Use for new agents" makes the added account the default;
	 * the owner toasts, or offers to restart running agents onto it. */
	onDefaultSwitched: (agent: Agent, accountLabel: string) => void;
	/** When set, the dialog re-signs this existing login instead of adding a
	 * separate profile. */
	switchTarget?: SwitchSignInTarget | null;
}

/**
 * Two credential-free sign-in flows: adding another agent account as a
 * separate profile dir, or re-signing an existing login (a profile, or the
 * system default). Either way the user runs the agent's own login in a
 * terminal and we only watch local state for the result — Superset never
 * handles the credentials (see usage/default-account.ts). A new profile can
 * be a subscription (quota shows here) or API-billed (pay per token through
 * the provider's console; the key stays inside the CLI).
 */
export function AddAccountDialog({
	open,
	onOpenChange,
	hostUrl,
	agent: addAgent,
	onAccountAdded,
	onDefaultSwitched,
	switchTarget = null,
}: AddAccountDialogProps) {
	const { t } = useLingui();
	const { activeHostUrl } = useLocalHostService();
	const canRunLocally = !!hostUrl && hostUrl === activeHostUrl;
	const [terminalAttempt, setTerminalAttempt] = useState(0);
	const [terminalRunning, setTerminalRunning] = useState(false);
	const [commandSucceeded, setCommandSucceeded] = useState(false);
	const agent = switchTarget?.agent ?? addAgent;
	const billingId = useId();
	const nameId = useId();
	const [name, setName] = useState("work");
	const [credentialKind, setCredentialKind] =
		useState<AccountCredentialKind>("subscription");
	const [copied, setCopied] = useState(false);
	const [found, setFound] = useState<FoundLogin | null>(null);
	const baselineRef = useRef<UsageLogins | null>(null);
	const slug = slugify(name);

	const loginsQuery = useHostUsageLogins(hostUrl, open && !found);
	const setDefault = useSetDefaultUsageAccount(hostUrl);

	// The first poll result after opening is the baseline; anything beyond it
	// is the sign-in we are waiting for.
	useEffect(() => {
		if (!open) {
			baselineRef.current = null;
			setFound(null);
			setCopied(false);
			setTerminalAttempt(0);
			setTerminalRunning(false);
			setCommandSucceeded(false);
			setCredentialKind("subscription");
			return;
		}
		const logins = loginsQuery.data;
		if (!logins) return;
		if (!baselineRef.current) {
			baselineRef.current = logins;
			return;
		}
		if (found || (terminalAttempt > 0 && !commandSucceeded)) return;

		const provisionProfile = (selection: string) => {
			// Shares the default account's skills, plugins, MCP servers, and
			// settings into the new profile dir — a bare login there would boot
			// the CLI on an empty install (and, for Claude, into the first-boot
			// wizard).
			if (!hostUrl) return;
			void getHostServiceClientByUrl(hostUrl)
				.usage.prepareAccount.mutate({ agent, selection })
				.catch(() => {});
		};

		const selection = switchTarget
			? switchTarget.selection
			: `${logins.homeDir}/.${agent}-${slug}`;
		const fresh = findCompletedLogin({
			agent,
			credentialKind: switchTarget?.credentialKind ?? credentialKind,
			selection,
			baseline: baselineRef.current,
			current: logins,
			commandSucceeded,
		});
		if (fresh) {
			setFound(fresh);
			onAccountAdded();
			if (fresh.selection) provisionProfile(fresh.selection);
		}
	}, [
		open,
		loginsQuery.data,
		agent,
		credentialKind,
		switchTarget,
		found,
		onAccountAdded,
		hostUrl,
		terminalAttempt,
		commandSucceeded,
		slug,
	]);

	const command = switchTarget
		? switchSignInCommand(switchTarget)
		: addAccountCommand(agent, slug, credentialKind);
	// Codex's API login takes the key at a terminal prompt; every other flow
	// finishes in the browser.
	const promptsForKey =
		(switchTarget?.credentialKind ?? credentialKind) === "api_key" &&
		agent === "codex";

	const copyCommand = () => {
		void navigator.clipboard.writeText(command).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2_000);
		});
	};

	const switchDescription = switchTarget
		? switchTarget.selection === null
			? t({
					message: `Sign the system-default ${AGENT_LABELS[switchTarget.agent]} login into a different account. It replaces the current default sign-in on this machine; profiles and running agents are unaffected.`,
				})
			: t({
					message: `Sign the ${switchTarget.label} profile into a different account. Other profiles, the system default, and running agents are unaffected.`,
				})
		: null;

	const loginStatus = (
		<output className="min-w-0 text-xs text-muted-foreground">
			{(!canRunLocally || terminalRunning || commandSucceeded) && (
				<span className="flex items-center gap-2">
					<LuLoaderCircle className="size-3.5 shrink-0 animate-spin" />
					<Trans>Waiting for sign-in…</Trans>
				</span>
			)}
			{terminalAttempt > 0 && !terminalRunning && !commandSucceeded && (
				<Trans>Sign-in failed</Trans>
			)}
			{loginsQuery.isError && (
				<span role="alert">{errorMessage(loginsQuery.error)}</span>
			)}
		</output>
	);

	const commandDetails = (
		<div className="mt-2 flex flex-col gap-1">
			<span
				className={canRunLocally ? "hidden" : "text-xs text-muted-foreground"}
			>
				{promptsForKey ? (
					<Trans>
						Run in a terminal on this host; paste your key when asked:
					</Trans>
				) : (
					<Trans>Run in a terminal on this host:</Trans>
				)}
			</span>
			<div className="flex items-start gap-1.5 rounded-md border bg-muted/40 py-2 pr-1.5 pl-2.5">
				<span
					aria-hidden
					className="select-none font-mono text-xs leading-5 text-muted-foreground"
				>
					$
				</span>
				<code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs leading-5">
					{command}
				</code>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 shrink-0"
					onClick={copyCommand}
					aria-label={t({ message: "Copy command" })}
				>
					{copied ? (
						<LuCheck className="size-3 text-green-500" />
					) : (
						<LuCopy className="size-3" />
					)}
				</Button>
			</div>
		</div>
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				{terminalAttempt > 0 && !switchTarget && !found && (
					<Button
						variant="ghost"
						size="sm"
						className="-ml-2 -mt-1 w-fit text-muted-foreground"
						onClick={() => {
							baselineRef.current = loginsQuery.data ?? null;
							setTerminalAttempt(0);
							setTerminalRunning(false);
							setCommandSucceeded(false);
						}}
					>
						<LuArrowLeft className="size-3.5" />
						<Trans>Back</Trans>
					</Button>
				)}
				<DialogHeader>
					<DialogTitle>
						{switchTarget ? (
							<Trans>Switch sign-in</Trans>
						) : (
							<Trans>Add {AGENT_LABELS[agent]} account</Trans>
						)}
					</DialogTitle>
					<DialogDescription
						className={terminalAttempt > 0 ? "sr-only" : undefined}
					>
						{switchDescription ??
							(credentialKind === "api_key" ? (
								<Trans>
									A separate pay-per-token profile. The key stays in the{" "}
									{AGENT_LABELS[agent]} CLI.
								</Trans>
							) : (
								<Trans>
									A separate profile that shares your skills, plugins, MCP
									servers, and settings.
								</Trans>
							))}
					</DialogDescription>
				</DialogHeader>

				{found ? (
					<div className="flex min-w-0 flex-col gap-3">
						<div className="rounded-md border bg-card/40 p-3 text-sm">
							<span className="font-medium">{found.label}</span>{" "}
							{switchTarget ? (
								<Trans>is now signed in here.</Trans>
							) : (
								<Trans>is signed in.</Trans>
							)}
						</div>
						<div className="flex justify-end gap-2">
							<Button variant="ghost" onClick={() => onOpenChange(false)}>
								<Trans>Done</Trans>
							</Button>
							{!switchTarget && found.selection !== null && (
								<Button
									disabled={setDefault.isPending}
									onClick={() => {
										setDefault.mutate(
											{ agent, selection: found.selection },
											{
												onSuccess: () => {
													onDefaultSwitched(agent, found.label);
													onOpenChange(false);
												},
												onError: (error) => toast.error(errorMessage(error)),
											},
										);
									}}
								>
									<Trans>Use for new agents</Trans>
								</Button>
							)}
						</div>
					</div>
				) : (
					<div className="flex min-w-0 flex-col gap-3">
						{!switchTarget && terminalAttempt === 0 && (
							<div className="flex flex-col gap-4 py-2">
								<div className="flex items-center gap-2">
									<label
										htmlFor={nameId}
										className="w-24 shrink-0 text-sm text-muted-foreground"
									>
										<Trans>Profile name</Trans>
									</label>
									<Input
										id={nameId}
										value={name}
										onChange={(event) => setName(event.target.value)}
										className="h-9 min-w-0 flex-1 text-sm"
										placeholder="work"
									/>
								</div>
								<div className="flex items-center gap-2">
									<span className="w-24 shrink-0 text-sm text-muted-foreground">
										<Trans>Billing</Trans>
									</span>
									<RadioGroup
										value={credentialKind}
										onValueChange={(value) =>
											setCredentialKind(value as AccountCredentialKind)
										}
										className="flex items-center gap-4"
									>
										<label
											htmlFor={`${billingId}-subscription`}
											className="flex cursor-pointer items-center gap-2 text-sm"
										>
											<RadioGroupItem
												id={`${billingId}-subscription`}
												value="subscription"
												className="size-3.5"
											/>
											<Trans>Subscription</Trans>
										</label>
										<label
											htmlFor={`${billingId}-api_key`}
											className="flex cursor-pointer items-center gap-2 text-sm"
										>
											<RadioGroupItem
												id={`${billingId}-api_key`}
												value="api_key"
												className="size-3.5"
											/>
											<Trans>API key</Trans>
										</label>
									</RadioGroup>
								</div>
							</div>
						)}

						{!canRunLocally && commandDetails}

						{canRunLocally && open && terminalAttempt > 0 && (
							<div className="min-w-0 overflow-hidden rounded-lg border">
								<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/30 px-3 py-2.5">
									<div className="flex min-w-0 items-center gap-2 text-xs">
										<LuTerminal className="size-3.5 shrink-0 text-muted-foreground" />
										<span className="truncate font-medium">
											{switchTarget?.label ?? name}
										</span>
										<span className="shrink-0 text-muted-foreground">
											{(switchTarget?.credentialKind ?? credentialKind) ===
											"api_key" ? (
												<Trans>API key</Trans>
											) : (
												<Trans>Subscription</Trans>
											)}
										</span>
									</div>
									{loginStatus}
								</div>
								<div className="h-[220px] p-3">
									<CommandTerminal
										key={terminalAttempt}
										command={command}
										onExit={(exitCode) => {
											setTerminalRunning(false);
											setCommandSucceeded(exitCode === 0);
											void loginsQuery.refetch();
										}}
									/>
								</div>
							</div>
						)}
						{terminalAttempt === 0 &&
							(!canRunLocally || loginsQuery.isError) &&
							loginStatus}
						<div className="flex items-center justify-end gap-3 pt-1">
							<div className="flex shrink-0 items-center gap-2">
								{canRunLocally && terminalAttempt > 0 && (
									<Popover>
										<PopoverTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-8 text-muted-foreground"
												aria-label={t({ message: "Command" })}
												title={t({ message: "Command" })}
											>
												<LuTerminal className="size-4" />
											</Button>
										</PopoverTrigger>
										<PopoverContent
											side="top"
											align="end"
											className="w-[min(32rem,calc(100vw-3rem))] p-3"
										>
											<div className="text-xs font-medium">
												<Trans>Command</Trans>
											</div>
											{commandDetails}
										</PopoverContent>
									</Popover>
								)}
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onOpenChange(false)}
								>
									<Trans>Cancel</Trans>
								</Button>
								{canRunLocally && !terminalRunning && (
									<Button
										size="sm"
										disabled={!loginsQuery.data}
										onClick={() => {
											setCommandSucceeded(false);
											setTerminalRunning(true);
											setTerminalAttempt((attempt) => attempt + 1);
										}}
									>
										{terminalAttempt > 0 ? (
											<Trans>Try again</Trans>
										) : (
											<Trans>Sign in</Trans>
										)}
									</Button>
								)}
							</div>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
