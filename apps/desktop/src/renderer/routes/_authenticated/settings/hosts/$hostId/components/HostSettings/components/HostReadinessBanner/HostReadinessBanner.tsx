import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { CopyableCommand } from "renderer/routes/_authenticated/components/CopyableCommand";
import { GhAuthDialog } from "renderer/routes/_authenticated/components/GhAuthDialog";
import {
	GH_AUTH_COMMAND,
	GH_INSTALL_COMMAND,
} from "renderer/utils/classifyCloneError";

const UPDATE_COMMAND = "superset update";
/** GH_INSTALL_COMMAND is macOS-shaped; the host tells us what it actually is. */
function installCommandFor(platform: string | undefined): string | null {
	if (platform === "darwin") return GH_INSTALL_COMMAND;
	if (platform === "win32") return "winget install --id GitHub.cli";
	// Linux packaging is per-distro — a wrong command is worse than none.
	return null;
}
const START_COMMAND = "superset start --daemon";
const READINESS_STALE_MS = 30_000;

interface HostReadinessBannerProps {
	hostUrl: string | null;
	hostName: string;
	isOnline: boolean;
	/** False when presence came from the cloud row rather than the relay. */
	presenceKnown: boolean;
	isRemoteTarget: boolean;
}

/** Older hosts answer unknown procedures this way. */
function isMissingProcedure(error: unknown): boolean {
	return error instanceof Error && error.message.includes("No procedure found");
}

/**
 * One banner, only when something needs doing. The checks cascade: a machine
 * we can't reach can't report its version or its GitHub state either, so
 * those aren't failures to report — they're unanswerable.
 */
export function HostReadinessBanner({
	hostUrl,
	hostName,
	isOnline,
	presenceKnown,
	isRemoteTarget,
}: HostReadinessBannerProps) {
	const [ghAuthMode, setGhAuthMode] = useState<"auth" | "install" | null>(null);

	const infoQuery = useQuery({
		queryKey: ["host-readiness", "info", hostUrl],
		enabled: !!hostUrl,
		staleTime: READINESS_STALE_MS,
		retry: false,
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).host.info.query(),
	});

	const ghQuery = useQuery({
		queryKey: ["host-readiness", "gh", hostUrl],
		enabled: !!hostUrl && infoQuery.isSuccess,
		staleTime: READINESS_STALE_MS,
		retry: false,
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).host.githubCli.query(),
	});

	const signIn = isRemoteTarget ? null : setGhAuthMode;
	const dialog = isRemoteTarget ? null : (
		<GhAuthDialog
			open={ghAuthMode !== null}
			mode={ghAuthMode ?? "auth"}
			onOpenChange={(next) => {
				if (!next) setGhAuthMode(null);
			}}
			onExit={() => void ghQuery.refetch()}
		/>
	);

	if (!hostUrl || infoQuery.isPending) return null;

	if (infoQuery.isError) {
		// On your own machine, "open Superset on that machine" is nonsense —
		// you are looking at it. The app owns this host service, so the remedy
		// is restarting the app, and there is no command to paste anywhere.
		if (!isRemoteTarget) {
			return (
				<>
					<Banner
						title={
							<Trans>
								This device&apos;s host service isn&apos;t responding
							</Trans>
						}
						body={
							<Trans>
								Workspaces on this device won&apos;t open until it&apos;s back.
								Restarting Superset usually clears it.
							</Trans>
						}
					/>
					{dialog}
				</>
			);
		}
		// Live presence and no presence at all are different to us but not to
		// the reader: either way the machine isn't answering. Only "it is
		// definitely connected" earns different advice, because then the fix is
		// a restart rather than a start.
		const responding = isOnline && presenceKnown;
		// A host is a machine, not a process: the same machineId is served by the
		// desktop app's host-service or by `superset start`, and which one is
		// unknowable while it's unreachable. Name both remedies, and leave the
		// command off the restart case since how you restart depends on which.
		return (
			<>
				{responding ? (
					<Banner
						title={<Trans>{hostName} isn&apos;t responding</Trans>}
						body={
							<Trans>
								It&apos;s connected but not answering. Restarting Superset on
								that machine, or its host service, usually clears it.
							</Trans>
						}
					/>
				) : (
					<Banner
						title={<Trans>Can&apos;t reach {hostName}</Trans>}
						body={
							<Trans>
								It may be asleep or switched off. Open Superset on that machine,
								or start the host service from a terminal there.
							</Trans>
						}
						command={START_COMMAND}
					/>
				)}
				{dialog}
			</>
		);
	}

	// An older build has no gh probe. That absence is the staleness signal —
	// no version constant to keep in step, and it keeps working as procedures
	// are added after this one.
	if (ghQuery.isError && isMissingProcedure(ghQuery.error)) {
		const version = infoQuery.data?.version;
		return (
			<>
				<Banner
					title={
						<Trans>{hostName} is running an older version of Superset</Trans>
					}
					body={
						version ? (
							<Trans>
								It&apos;s on {version}. Update it there to enable the rest of
								this page.
							</Trans>
						) : (
							<Trans>Update it there to enable the rest of this page.</Trans>
						)
					}
					command={UPDATE_COMMAND}
				/>
				{dialog}
			</>
		);
	}

	if (ghQuery.data === "not_installed") {
		return (
			<>
				<Banner
					title={<Trans>GitHub CLI isn&apos;t installed on {hostName}</Trans>}
					body={
						<Trans>
							Cloning private repositories onto this machine needs it.
						</Trans>
					}
					command={signIn ? null : installCommandFor(infoQuery.data?.platform)}
					action={
						signIn ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => signIn("install")}
							>
								<Trans>Install GitHub CLI…</Trans>
							</Button>
						) : null
					}
				/>
				{dialog}
			</>
		);
	}

	if (ghQuery.data === "unauthenticated") {
		return (
			<>
				<Banner
					title={<Trans>{hostName} isn&apos;t signed in to GitHub</Trans>}
					body={
						<Trans>
							Cloning private repositories onto this machine will fail until it
							is.
						</Trans>
					}
					command={signIn ? null : GH_AUTH_COMMAND}
					action={
						signIn ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => signIn("auth")}
							>
								<Trans>Sign in to GitHub…</Trans>
							</Button>
						) : null
					}
				/>
				{dialog}
			</>
		);
	}

	return dialog;
}

function Banner({
	title,
	body,
	command,
	action,
}: {
	title: React.ReactNode;
	body: React.ReactNode;
	command?: string | null;
	action?: React.ReactNode;
}) {
	return (
		<div className="mb-8 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
			<div className="flex items-start gap-2">
				<LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
				<div className="min-w-0 flex-1 space-y-0.5">
					<p className="text-sm font-medium">{title}</p>
					<p className="text-xs text-muted-foreground">{body}</p>
				</div>
			</div>
			{command && <CopyableCommand command={command} />}
			{action}
		</div>
	);
}
