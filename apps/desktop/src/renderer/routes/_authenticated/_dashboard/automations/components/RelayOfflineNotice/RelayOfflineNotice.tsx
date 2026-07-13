import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { ExposeViaRelayConfirmDialog } from "renderer/routes/_authenticated/components/ExposeViaRelayConfirmDialog";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface RelayOfflineNoticeProps {
	hostId: string | null;
	className?: string;
}

/**
 * Automations dispatch from the cloud through the relay, so even the local
 * device is unreachable until relay access is enabled in Settings > Security.
 * Renders nothing while connectivity is unknown (row not yet synced).
 */
export function RelayOfflineNotice({
	hostId,
	className,
}: RelayOfflineNoticeProps) {
	const { machineId } = useLocalHostService();
	const { localHostId, localHostIsOnline, otherHosts } =
		useWorkspaceHostOptions();
	const { gateFeature } = usePaywall();
	const [confirmOpen, setConfirmOpen] = useState(false);

	const utils = electronTrpc.useUtils();
	const setExpose =
		electronTrpc.settings.setExposeHostServiceViaRelay.useMutation({
			onSettled: () => {
				utils.settings.getExposeHostServiceViaRelay.invalidate();
			},
		});

	const isLocal =
		hostId === null || hostId === machineId || hostId === localHostId;
	const remoteHost = isLocal
		? null
		: otherHosts.find((host) => host.id === hostId);
	const offline = isLocal
		? localHostIsOnline === false
		: remoteHost
			? !remoteHost.isOnline
			: false;
	if (!offline) return null;

	const enableRelay = () => {
		setConfirmOpen(false);
		toast.promise(setExpose.mutateAsync({ enabled: true }), {
			loading: "Restarting host services…",
			success: "Relay access enabled — connecting to the relay…",
			error: (err: Error) => err.message ?? "Failed to enable relay access",
		});
	};

	return (
		<div
			className={cn(
				"flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground select-text cursor-text",
				className,
			)}
		>
			<LuTriangleAlert
				className="mt-0.5 size-3.5 shrink-0 text-amber-500"
				aria-hidden="true"
			/>
			{isLocal ? (
				<div className="flex flex-col items-start gap-1.5">
					<span>
						This device isn't connected to the Superset relay, so automations
						can't reach it and runs will be skipped.
					</span>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-xs"
						disabled={setExpose.isPending}
						onClick={() =>
							gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, () =>
								setConfirmOpen(true),
							)
						}
					>
						Enable relay access…
					</Button>
					<ExposeViaRelayConfirmDialog
						open={confirmOpen}
						targetEnabled
						onOpenChange={setConfirmOpen}
						onConfirm={enableRelay}
					/>
				</div>
			) : (
				<span>
					<span className="font-medium text-foreground">
						{remoteHost?.name ?? "This device"}
					</span>{" "}
					isn't connected to the Superset relay — runs targeting it will be
					skipped until it reconnects. Check its{" "}
					{hostId ? (
						<Link
							to="/settings/hosts/$hostId"
							params={{ hostId }}
							className="font-medium text-foreground underline underline-offset-2"
						>
							host settings
						</Link>
					) : (
						"host settings"
					)}
					, and make sure relay access is enabled in Settings &gt; Security on
					that device.
				</span>
			)}
		</div>
	);
}
