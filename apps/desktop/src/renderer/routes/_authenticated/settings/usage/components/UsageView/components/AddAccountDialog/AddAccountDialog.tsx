import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
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
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuCopy, LuLoaderCircle } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { UsageLogins } from "../../../../hooks/useHostUsageLogins";
import { useHostUsageLogins } from "../../../../hooks/useHostUsageLogins";
import { useSetDefaultUsageAccount } from "../../../../hooks/useSetDefaultUsageAccount";
import { switchSignInCommand } from "../../utils/switchSignInCommand";

type Agent = "claude" | "codex";

const AGENT_LABELS: Record<Agent, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

/** The login being re-signed by "Switch sign-in": a profile dir, or the
 * system default when selection is null. */
export interface SwitchSignInTarget {
	agent: Agent;
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

// $HOME stays unexpanded on purpose — the user's shell resolves it, so the
// same command works over SSH to a remote host.
function addAccountCommand(agent: Agent, slug: string): string {
	if (agent === "claude") {
		return `CLAUDE_CONFIG_DIR="$HOME/.claude-${slug}" claude auth login`;
	}
	return `mkdir -p "$HOME/.codex-${slug}" && CODEX_HOME="$HOME/.codex-${slug}" codex login`;
}

/** The sign-in that landed after the dialog opened, if any. */
function findNewLogin(
	agent: Agent,
	baseline: UsageLogins,
	current: UsageLogins,
): { selection: string; label: string } | null {
	if (agent === "claude") {
		const known = new Set(baseline.claude.map((entry) => entry.configDir));
		const fresh = current.claude.find((entry) => !known.has(entry.configDir));
		return fresh
			? { selection: fresh.configDir, label: fresh.email ?? fresh.configDir }
			: null;
	}
	const known = new Set(baseline.codex.map((entry) => entry.home));
	const fresh = current.codex.find((entry) => !known.has(entry.home));
	return fresh ? { selection: fresh.home, label: fresh.home } : null;
}

/** A change of identity in the target login, if any. */
function findSignInChange(
	target: SwitchSignInTarget,
	baseline: UsageLogins,
	current: UsageLogins,
): { label: string } | null {
	if (target.agent === "claude") {
		if (target.selection === null) {
			return current.claudeDefaultEmail &&
				current.claudeDefaultEmail !== baseline.claudeDefaultEmail
				? { label: current.claudeDefaultEmail }
				: null;
		}
		const before =
			baseline.claude.find((entry) => entry.configDir === target.selection)
				?.email ?? null;
		const after =
			current.claude.find((entry) => entry.configDir === target.selection)
				?.email ?? null;
		return after && after !== before ? { label: after } : null;
	}
	// Codex: identity isn't knowable locally, so compare auth.json content.
	const home = target.selection ?? current.codex[0]?.home;
	const before =
		baseline.codex.find((entry) => entry.home === home)?.fingerprint ?? null;
	const after =
		current.codex.find((entry) => entry.home === home)?.fingerprint ?? null;
	return after && after !== before
		? {
				label: i18n._(
					msg({
						message: "The Codex sign-in",
					}),
				),
			}
		: null;
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
 * handles the credentials (see usage/default-account.ts).
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
	const agent = switchTarget?.agent ?? addAgent;
	const [name, setName] = useState("work");
	const [copied, setCopied] = useState(false);
	const [found, setFound] = useState<{
		selection: string | null;
		label: string;
	} | null>(null);
	const baselineRef = useRef<UsageLogins | null>(null);

	const loginsQuery = useHostUsageLogins(hostUrl, open && !found);
	const setDefault = useSetDefaultUsageAccount(hostUrl);

	// The first poll result after opening is the baseline; anything beyond it
	// is the sign-in we are waiting for.
	useEffect(() => {
		if (!open) {
			baselineRef.current = null;
			setFound(null);
			setCopied(false);
			return;
		}
		const logins = loginsQuery.data;
		if (!logins) return;
		if (!baselineRef.current) {
			baselineRef.current = logins;
			return;
		}
		if (found) return;

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

		if (switchTarget) {
			const change = findSignInChange(
				switchTarget,
				baselineRef.current,
				logins,
			);
			if (change) {
				setFound({ selection: null, label: change.label });
				onAccountAdded();
				// The system default (null) is the share's source, not a target.
				if (switchTarget.selection) provisionProfile(switchTarget.selection);
			}
			return;
		}
		const fresh = findNewLogin(agent, baselineRef.current, logins);
		if (fresh) {
			setFound(fresh);
			onAccountAdded();
			provisionProfile(fresh.selection);
		}
	}, [
		open,
		loginsQuery.data,
		agent,
		switchTarget,
		found,
		onAccountAdded,
		hostUrl,
	]);

	const slug = slugify(name);
	const command = switchTarget
		? switchSignInCommand(switchTarget)
		: addAccountCommand(agent, slug);

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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{switchTarget ? (
							<Trans>Switch sign-in</Trans>
						) : (
							<Trans>Add {AGENT_LABELS[agent]} account</Trans>
						)}
					</DialogTitle>
					<DialogDescription>
						{switchDescription ?? (
							<Trans>
								Sign in to a second subscription as a separate profile. Your
								current login is untouched, and the new profile shares your
								skills, plugins, MCP servers, and settings.
							</Trans>
						)}
					</DialogDescription>
				</DialogHeader>

				{found ? (
					<div className="flex flex-col gap-3">
						<div className="rounded-md border bg-card/40 p-3 text-sm">
							<span className="font-medium">{found.label}</span>{" "}
							{switchTarget ? (
								<Trans>is now signed in here.</Trans>
							) : (
								<Trans>is signed in and will show its quota here.</Trans>
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
					<div className="flex flex-col gap-3">
						{!switchTarget && (
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground">
									<Trans>Profile name</Trans>
								</span>
								<Input
									value={name}
									onChange={(event) => setName(event.target.value)}
									className="h-7 flex-1 text-xs"
									placeholder="work"
								/>
							</div>
						)}

						<div className="flex flex-col gap-1">
							<span className="text-xs text-muted-foreground">
								<Trans>
									Run this in any terminal on this host, then finish the sign-in
									in your browser:
								</Trans>
							</span>
							<div className="flex items-start gap-1.5 rounded-md border bg-muted/40 p-2">
								<code className="flex-1 whitespace-pre-wrap break-all font-mono text-[11px]">
									{command}
								</code>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 shrink-0"
									onClick={copyCommand}
								>
									{copied ? (
										<LuCheck className="size-3 text-green-500" />
									) : (
										<LuCopy className="size-3" />
									)}
								</Button>
							</div>
						</div>

						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<LuLoaderCircle className="size-3 animate-spin" />
							<Trans>
								Waiting for the sign-in to complete — this updates
								automatically.
							</Trans>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
