import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { LuTriangleAlert } from "react-icons/lu";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
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
				<span>
					This device isn't connected to the Superset relay, so automations
					can't reach it and runs will be skipped. Turn on{" "}
					<span className="font-medium text-foreground">
						Allow remote workspaces to access this device via relay
					</span>{" "}
					in{" "}
					<Link
						to="/settings/security"
						className="font-medium text-foreground underline underline-offset-2"
					>
						Settings &gt; Security
					</Link>
					.
				</span>
			) : (
				<span>
					<span className="font-medium text-foreground">
						{remoteHost?.name ?? "This device"}
					</span>{" "}
					isn't connected to the Superset relay — runs targeting it will be
					skipped until it reconnects. Relay access is enabled in{" "}
					<Link
						to="/settings/security"
						className="font-medium text-foreground underline underline-offset-2"
					>
						Settings &gt; Security
					</Link>{" "}
					on that device.
				</span>
			)}
		</div>
	);
}
