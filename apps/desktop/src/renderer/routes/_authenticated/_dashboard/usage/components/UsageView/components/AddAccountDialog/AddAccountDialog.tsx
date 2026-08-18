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

type Provider = "claude" | "codex";

const PROVIDER_LABELS: Record<Provider, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

/** The login being re-signed by "Switch sign-in": a profile dir, or the
 * system default when selection is null. */
export interface SwitchSignInTarget {
	provider: Provider;
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
function addAccountCommand(provider: Provider, slug: string): string {
	if (provider === "claude") {
		return `CLAUDE_CONFIG_DIR="$HOME/.claude-${slug}" claude auth login`;
	}
	return `mkdir -p "$HOME/.codex-${slug}" && CODEX_HOME="$HOME/.codex-${slug}" codex login`;
}

// Re-signs an existing login in place: the system default runs the CLI bare,
// a profile runs it against its own dir.
function switchSignInCommand(target: SwitchSignInTarget): string {
	if (target.provider === "claude") {
		return target.selection === null
			? "claude auth login"
			: `CLAUDE_CONFIG_DIR="${target.selection}" claude auth login`;
	}
	return target.selection === null
		? "codex login"
		: `CODEX_HOME="${target.selection}" codex login`;
}

/** The sign-in that landed after the dialog opened, if any. */
function findNewLogin(
	provider: Provider,
	baseline: UsageLogins,
	current: UsageLogins,
): { selection: string; label: string } | null {
	if (provider === "claude") {
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
	if (target.provider === "claude") {
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
	return after && after !== before ? { label: "The Codex sign-in" } : null;
}

interface AddAccountDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hostUrl: string | null;
	/** Provider being added; the per-provider Add buttons preselect it. */
	provider: Provider;
	/** Called once when the new sign-in is detected, to refresh quota. */
	onAccountAdded: () => void;
	/** When set, the dialog re-signs this existing login instead of adding a
	 * separate profile. */
	switchTarget?: SwitchSignInTarget | null;
}

/**
 * Two credential-free sign-in flows: adding another provider account as a
 * separate profile dir, or re-signing an existing login (a profile, or the
 * system default). Either way the user runs the provider's own login in a
 * terminal and we only watch local state for the result — Superset never
 * handles the credentials (see usage/default-account.ts).
 */
export function AddAccountDialog({
	open,
	onOpenChange,
	hostUrl,
	provider: addProvider,
	onAccountAdded,
	switchTarget = null,
}: AddAccountDialogProps) {
	const provider = switchTarget?.provider ?? addProvider;
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

		const seedProfile = (configDir: string) => {
			// A fresh (or re-signed) Claude profile may have the CLI's first-boot
			// wizard armed; mark onboarding done so its first agent launch opens
			// the prompt.
			if (!hostUrl) return;
			void getHostServiceClientByUrl(hostUrl)
				.usage.prepareClaudeProfile.mutate({ configDir })
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
				if (switchTarget.provider === "claude" && switchTarget.selection) {
					seedProfile(switchTarget.selection);
				}
			}
			return;
		}
		const fresh = findNewLogin(provider, baselineRef.current, logins);
		if (fresh) {
			setFound(fresh);
			onAccountAdded();
			if (provider === "claude") seedProfile(fresh.selection);
		}
	}, [
		open,
		loginsQuery.data,
		provider,
		switchTarget,
		found,
		onAccountAdded,
		hostUrl,
	]);

	const slug = slugify(name);
	const command = switchTarget
		? switchSignInCommand(switchTarget)
		: addAccountCommand(provider, slug);

	const copyCommand = () => {
		void navigator.clipboard.writeText(command).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2_000);
		});
	};

	const switchDescription = switchTarget
		? switchTarget.selection === null
			? `Sign the system-default ${PROVIDER_LABELS[switchTarget.provider]} login into a different account. It replaces the current default sign-in on this machine; profiles and running agents are unaffected.`
			: `Sign the ${switchTarget.label} profile into a different account. Other profiles, the system default, and running agents are unaffected.`
		: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{switchTarget
							? "Switch sign-in"
							: `Add ${PROVIDER_LABELS[provider]} account`}
					</DialogTitle>
					<DialogDescription>
						{switchDescription ??
							"Sign in to a second subscription as a separate profile. Your current login is untouched."}
					</DialogDescription>
				</DialogHeader>

				{found ? (
					<div className="flex flex-col gap-3">
						<div className="rounded-md border bg-card/40 p-3 text-sm">
							<span className="font-medium">{found.label}</span>{" "}
							{switchTarget
								? "is now signed in here."
								: "is signed in and will show its quota here."}
						</div>
						<div className="flex justify-end gap-2">
							<Button variant="ghost" onClick={() => onOpenChange(false)}>
								Done
							</Button>
							{!switchTarget && found.selection !== null && (
								<Button
									disabled={setDefault.isPending}
									onClick={() => {
										setDefault.mutate(
											{ provider, selection: found.selection },
											{
												onSuccess: () => {
													toast.success(`New agents will use ${found.label}.`, {
														description:
															"Running sessions keep their current account — restart them to switch.",
													});
													onOpenChange(false);
												},
												onError: (error) => toast.error(error.message),
											},
										);
									}}
								>
									Use for new agents
								</Button>
							)}
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{!switchTarget && (
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground">
									Profile name
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
								Run this in any terminal on this host, then finish the sign-in
								in your browser:
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
							Waiting for the sign-in to complete — this updates automatically.
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
