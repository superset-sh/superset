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

/** GH_INSTALL_COMMAND is macOS-shaped; the host tells us what it actually is. */
function installCommandFor(platform: string | undefined): string | null {
	if (platform === "darwin") return GH_INSTALL_COMMAND;
	if (platform === "win32") return "winget install --id GitHub.cli";
	// Linux packaging is per-distro — a wrong command is worse than none.
	return null;
}

const READINESS_STALE_MS = 30_000;

interface HostReadinessBannerProps {
	hostUrl: string | null;
	hostName: string;
	isOnline: boolean;
	isRemoteTarget: boolean;
}

/**
 * Whether this machine can reach GitHub, answered before a clone needs it
 * rather than during one. Version, install source and reachability belong to
 * HostServiceSection; this only covers what that section doesn't know about.
 */
export function HostReadinessBanner({
	hostUrl,
	hostName,
	isOnline,
	isRemoteTarget,
}: HostReadinessBannerProps) {
	const [ghAuthMode, setGhAuthMode] = useState<"auth" | "install" | null>(null);

	const infoQuery = useQuery({
		queryKey: ["host-readiness", "info", hostUrl],
		enabled: !!hostUrl && isOnline,
		staleTime: READINESS_STALE_MS,
		retry: false,
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).host.info.query(),
	});

	const ghQuery = useQuery({
		queryKey: ["host-readiness", "gh", hostUrl],
		enabled: !!hostUrl && isOnline && infoQuery.isSuccess,
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

	// A host we can't reach can't report its GitHub state either, and an older
	// build has no probe at all. Neither is a failure worth a banner — the
	// section above already says the machine is unreachable or behind.
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
