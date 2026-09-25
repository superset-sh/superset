import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import {
	type HostInstallSource,
	hostNeedsUpdate,
	isHostUpdateTarget,
	parseHostInstallSource,
} from "@superset/shared/host-version";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import { useHostServiceUpdate } from "renderer/hooks/host-service/useHostServiceUpdate";
import {
	useAppVersion,
	useHostVersionState,
} from "renderer/hooks/host-version/useHostVersionState";
import { useNow } from "renderer/hooks/useNow";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HostUpdateSteps } from "renderer/routes/_authenticated/components/HostUpdateSteps";
import { HostVersionBadge } from "renderer/routes/_authenticated/components/HostVersionBadge";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

interface HostServiceSectionProps {
	hostUrl: string | null;
	isLocalHost: boolean;
	isOnline: boolean;
	/** Owners may update; members only see the state. */
	canUpdate: boolean;
	/** What the cloud remembers from the host's last registration. */
	registered: {
		version: string | null;
		platform: string | null;
		installSource: string | null;
	};
	lastSeenAt: number | null;
}

function formatUptime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m`;
	return `${Math.floor(seconds)}s`;
}

export function HostServiceSection({
	hostUrl,
	isLocalHost,
	isOnline,
	canUpdate,
	registered,
	lastSeenAt,
}: HostServiceSectionProps) {
	const { formatRelativeTime } = useFormat();

	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const appVersion = useAppVersion();
	const now = useNow(30_000);
	const { activeOrganizationId } = useLocalHostService();

	const info = useHostServiceInfo(hostUrl, isOnline);
	const live = info.data ?? null;
	const version = live?.version ?? registered.version;
	const installSource: HostInstallSource =
		live && live.installSource !== "unknown"
			? live.installSource
			: parseHostInstallSource(registered.installSource);
	const platform =
		live?.platform && live.arch
			? `${live.platform} · ${live.arch}`
			: (registered.platform?.replace("-", " · ") ?? null);
	const state = useHostVersionState(version);
	const needsUpdate = hostNeedsUpdate(state);

	const update = useHostServiceUpdate({ hostUrl, targetVersion: appVersion });
	const [previousVersion, setPreviousVersion] = useState<string | null>(null);
	const updating =
		update.progress.stage !== "idle" &&
		update.progress.stage !== "updated" &&
		update.progress.stage !== "failed";

	const restartLocal = electronTrpc.hostServiceCoordinator.reset.useMutation({
		onSuccess: () => {
			toast.success(t({ message: "Host service restarted" }));
			void info.refetch();
		},
		onError: (error) =>
			toast.error(t({ message: "Could not restart the host service" }), {
				description: errorMessage(error),
			}),
	});

	useEffect(() => {
		if (update.progress.stage === "updated") {
			toast.success(
				t({ message: `Host service updated to ${update.progress.target}` }),
			);
		}
	}, [update.progress.stage, update.progress.target, t]);

	const installedVia =
		installSource === "desktop"
			? t({ message: "Superset app" })
			: installSource === "cli"
				? t({ message: "Superset CLI" })
				: installSource === "dev"
					? t({ message: "Development build" })
					: t({ message: "Unknown" });

	const hint = (() => {
		if (updating) {
			return t({
				message:
					"The host service restarts once the download is verified. Terminals reconnect on their own; the previous build is kept until the new one answers.",
			});
		}
		if (!isOnline) {
			return t({
				message: "As last reported. The host must be online to update.",
			});
		}
		if (isLocalHost) {
			if (state === "current") {
				if (installSource !== "desktop") {
					return t({ message: "Same version as this app." });
				}
				return t({
					message:
						"Bundled with the Superset app on this device. Updates with the app.",
				});
			}
			if (state === "unknown") {
				return installSource === "desktop"
					? t({ message: "Bundled with the Superset app on this device." })
					: t({ message: "This host has not reported a version yet." });
			}
			return t({
				message: `The app is on ${appVersion} but attached to a host service started by something else, likely an older CLI or another Superset build. Restarting replaces it with this app's copy.`,
			});
		}
		if (
			needsUpdate &&
			installSource !== "desktop" &&
			(!live?.updatable || !isHostUpdateTarget(appVersion))
		) {
			return t({
				message:
					"Update Superset on that device. In-app updates require a supported standalone install and a released app version.",
			});
		}
		switch (state) {
			case "current":
				return t({ message: "Same version as this app." });
			case "behind":
				return installSource === "desktop"
					? t({
							message:
								"Runs inside the Superset app on that device, so updating it means updating the app there.",
						})
					: t({
							message:
								"This host is behind the app you are using. Workspaces still open, but newer features may fail on it.",
						});
			case "incompatible":
				return installSource === "desktop"
					? t({
							message:
								"Too old for this app to talk to. Update the Superset app on that device to reconnect.",
						})
					: t({
							message:
								"Too old for this app to talk to. Workspaces on this host will not open until it is updated.",
						});
			case "ahead":
				return t({
					message:
						"Newer than this app. Everything works; update the app to match.",
				});
			default:
				return t({ message: "This host has not reported a version yet." });
		}
	})();

	const showUpdateButton =
		!isLocalHost &&
		isOnline &&
		needsUpdate &&
		installSource === "cli" &&
		live?.updatable === true &&
		isHostUpdateTarget(appVersion) &&
		canUpdate;
	const showRestartButton =
		isLocalHost && isOnline && state !== "current" && state !== "unknown";

	return (
		<section className="space-y-3">
			<h3 className="text-sm font-medium">
				<HighlightText
					text={t({ message: "Host service" })}
					query={searchQuery}
				/>
			</h3>
			<div className="overflow-hidden rounded-md border border-border/60">
				{update.progress.stage === "failed" && update.progress.error ? (
					<div className="flex items-start gap-2.5 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground/85">
						<LuTriangleAlert
							className="mt-0.5 size-3.5 shrink-0 text-destructive"
							aria-hidden="true"
						/>
						<span className="min-w-0 flex-1 select-text cursor-text">
							{update.progress.error}
						</span>
					</div>
				) : null}
				<div className="flex items-start justify-between gap-6 px-3 py-2.5">
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">
							{updating ? (
								<Trans>Updating to {update.progress.target}</Trans>
							) : (
								<Trans>Version</Trans>
							)}
						</p>
						<p className="mt-0.5 max-w-[52ch] text-xs text-muted-foreground">
							{update.progress.stage === "updated" ? (
								<Trans>Updated just now from {previousVersion ?? "?"}.</Trans>
							) : (
								hint
							)}
						</p>
					</div>
					<div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
						{!updating && (
							<HostVersionBadge
								state={state}
								offline={!isOnline}
								className={
									isLocalHost && state === "ahead" ? "hidden" : undefined
								}
							/>
						)}
						<code className="select-text cursor-text font-mono text-[12px] tabular-nums text-foreground">
							{version ?? "—"}
						</code>
						{(needsUpdate || updating) && !isLocalHost && (
							<code className="font-mono text-[12px] tabular-nums text-muted-foreground">
								→ {appVersion}
							</code>
						)}
						{isLocalHost && state !== "current" && state !== "unknown" && (
							<code className="font-mono text-[12px] tabular-nums text-muted-foreground">
								<Trans>app {appVersion}</Trans>
							</code>
						)}
						{showUpdateButton && (
							<Button
								size="sm"
								className="h-7 px-2.5 text-[13px]"
								disabled={updating}
								onClick={() => {
									setPreviousVersion(version);
									void update.start();
								}}
							>
								{update.progress.stage === "failed" ? (
									<Trans>Try again</Trans>
								) : (
									<Trans>Update host service</Trans>
								)}
							</Button>
						)}
						{showRestartButton && (
							<Button
								size="sm"
								className="h-7 px-2.5 text-[13px]"
								disabled={restartLocal.isPending || !activeOrganizationId}
								onClick={() =>
									activeOrganizationId &&
									restartLocal.mutate({ organizationId: activeOrganizationId })
								}
							>
								{restartLocal.isPending ? (
									<Trans>Restarting…</Trans>
								) : (
									<Trans>Restart host service</Trans>
								)}
							</Button>
						)}
					</div>
				</div>
				{updating && (
					<div className="border-t border-border/60 px-3 py-2.5">
						<HostUpdateSteps
							stage={update.progress.stage}
							startedAt={update.progress.startedAt}
						/>
					</div>
				)}
				<div className="grid grid-cols-1 border-t border-border/60 sm:grid-cols-2">
					<div className="px-3 py-2">
						<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
							<Trans>Platform</Trans>
						</p>
						<p className="mt-0.5 font-mono text-[12px] text-foreground">
							{platform ?? "—"}
						</p>
					</div>
					<div className="border-t border-border/60 px-3 py-2 sm:border-l sm:border-t-0">
						<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
							{live?.uptime !== undefined ? (
								<Trans>Uptime</Trans>
							) : isOnline ? (
								<Trans>Installed via</Trans>
							) : (
								<Trans>Last seen</Trans>
							)}
						</p>
						<p className="mt-0.5 font-mono text-[12px] text-foreground">
							{live?.uptime !== undefined
								? `${formatUptime(live.uptime)} · ${installedVia}`
								: isOnline
									? installedVia
									: lastSeenAt
										? formatRelativeTime(lastSeenAt, now)
										: "—"}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
