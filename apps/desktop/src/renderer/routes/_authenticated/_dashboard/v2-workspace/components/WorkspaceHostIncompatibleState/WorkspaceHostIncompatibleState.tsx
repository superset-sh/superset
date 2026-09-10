import { Trans } from "@lingui/react/macro";
import {
	type HostInstallSource,
	isHostUpdateTarget,
} from "@superset/shared/host-version";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpCircle, Monitor, Settings } from "lucide-react";
import { useHostServiceInfo } from "renderer/hooks/host-service/useHostServiceInfo";
import { useHostServiceUpdate } from "renderer/hooks/host-service/useHostServiceUpdate";
import { useAppVersion } from "renderer/hooks/host-version/useHostVersionState";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { HostUpdateSteps } from "renderer/routes/_authenticated/components/HostUpdateSteps";

interface WorkspaceHostIncompatibleStateProps {
	hostId: string;
	hostUrl: string;
	hostName: string;
	hostVersion: string;
	minVersion: string;
	installSource: HostInstallSource;
}

export function WorkspaceHostIncompatibleState({
	hostId,
	hostUrl,
	hostName,
	hostVersion,
	minVersion,
	installSource,
}: WorkspaceHostIncompatibleStateProps) {
	const appVersion = useAppVersion();
	const update = useHostServiceUpdate({ hostUrl, targetVersion: appVersion });
	const updating =
		update.progress.stage !== "idle" &&
		update.progress.stage !== "updated" &&
		update.progress.stage !== "failed";
	const { data: session } = authClient.useSession();
	const { data: members = [] } =
		cloudTrpc.v2Host.listMembers.useQuery(undefined);
	const { data: info } = useHostServiceInfo(hostUrl);
	const isOwner = members.some(
		(member) =>
			member.hostId === hostId &&
			member.userId === session?.user?.id &&
			member.role === "owner",
	);
	const canUpdateInPlace =
		installSource === "cli" &&
		info?.updatable === true &&
		isHostUpdateTarget(appVersion);

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-6">
				<div className="relative">
					<div className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted/30">
						<Monitor
							className="size-[18px] text-muted-foreground"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</div>
					<span
						aria-hidden="true"
						className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-amber-500/90 text-background ring-2 ring-background"
					>
						<ArrowUpCircle className="size-2.5" strokeWidth={3} />
					</span>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						<Trans>Host needs an update</Trans>
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						{canUpdateInPlace ? (
							<Trans>
								This workspace's host runs an older host service than this app
								supports. Update it to reconnect; the workspace and its files
								are untouched.
							</Trans>
						) : (
							<Trans>
								Update Superset on that device. In-app updates require a
								supported standalone install and a released app version.
							</Trans>
						)}
					</p>
				</div>

				<div className="flex w-full flex-col gap-0 overflow-hidden rounded-md border border-border/60 bg-muted/30">
					<div className="flex items-center justify-between gap-2.5 px-3 py-2">
						<div className="flex min-w-0 items-center gap-2.5">
							<span
								aria-hidden="true"
								className="size-1.5 shrink-0 rounded-full bg-emerald-500"
							/>
							<span
								className="select-text cursor-text min-w-0 truncate text-[13px] font-medium text-foreground"
								title={hostName}
							>
								{hostName}
							</span>
						</div>
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
							{installSource === "cli" ? (
								<Trans>Superset CLI</Trans>
							) : installSource === "desktop" ? (
								<Trans>Superset app</Trans>
							) : null}
						</span>
					</div>
					<div className="border-t border-border/60 px-3 py-2">
						<div className="flex items-center justify-between gap-3">
							<span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
								<Trans>Running</Trans>
							</span>
							<code className="select-text cursor-text font-mono text-[12px] tabular-nums text-foreground">
								{hostVersion}
							</code>
						</div>
						<div className="mt-1 flex items-center justify-between gap-3">
							<span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
								<Trans>Required</Trans>
							</span>
							<code className="select-text cursor-text font-mono text-[12px] tabular-nums text-muted-foreground">
								≥ {minVersion}
							</code>
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
					{update.progress.stage === "failed" && update.progress.error && (
						<div className="select-text cursor-text border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground/85">
							{update.progress.error}
						</div>
					)}
				</div>

				<div className="flex w-full flex-wrap items-center gap-2">
					{canUpdateInPlace && isOwner && (
						<Button
							size="sm"
							className="h-7 px-2.5 text-[13px] font-medium"
							disabled={updating}
							onClick={() => void update.start()}
						>
							{updating ? (
								<Trans>Updating…</Trans>
							) : update.progress.stage === "failed" ? (
								<Trans>Try again</Trans>
							) : (
								<Trans>Update host service</Trans>
							)}
						</Button>
					)}
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium text-foreground hover:bg-muted/60"
					>
						<Link to="/settings/hosts/$hostId" params={{ hostId }}>
							<Settings
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
							<Trans>Host settings</Trans>
						</Link>
					</Button>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="ml-auto h-7 gap-1.5 px-2 text-[13px] font-medium text-muted-foreground hover:bg-muted/60"
					>
						<Link to="/v2-workspaces">
							<Trans>Browse workspaces</Trans>
							<ArrowRight
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
