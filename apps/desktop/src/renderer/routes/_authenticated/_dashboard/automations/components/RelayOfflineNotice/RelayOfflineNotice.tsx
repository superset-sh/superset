import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { ExposeViaRelayConfirmDialog } from "renderer/routes/_authenticated/components/ExposeViaRelayConfirmDialog";
import { useEnableRelayAccess } from "../../hooks/useEnableRelayAccess";
import { useRelayHostTarget } from "../../hooks/useRelayHostTarget";

interface RelayOfflineNoticeProps {
	hostId: string | null;
	className?: string;
}

const WRAPPER_CLASS =
	"flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-foreground/85 select-text cursor-text";

const ICON = (
	<LuTriangleAlert
		className="mt-0.5 size-3.5 shrink-0 text-amber-500"
		aria-hidden="true"
	/>
);

/**
 * Automations dispatch from the cloud through the relay, so even the local
 * device is unreachable until relay access is enabled in Settings > Security.
 * Renders nothing while connectivity is unknown (row not yet synced).
 */
export function RelayOfflineNotice({
	hostId,
	className,
}: RelayOfflineNoticeProps) {
	const { isLocal, remoteHost, localHostIsOnline } = useRelayHostTarget(hostId);
	const { gateFeature } = usePaywall();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const { enableRelay, isPending } = useEnableRelayAccess();

	if (isLocal) {
		if (localHostIsOnline !== false) return null;
		return (
			<div className={cn(WRAPPER_CLASS, className)}>
				<div className="flex min-w-[240px] flex-1 items-start gap-2">
					{ICON}
					<span>
						This device isn't connected to the Superset relay, so automation
						runs will be skipped.
					</span>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto h-7 shrink-0 border-amber-500/40 bg-amber-500/10 px-2.5 text-xs text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
					disabled={isPending}
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
					onConfirm={() => {
						setConfirmOpen(false);
						enableRelay();
					}}
				/>
			</div>
		);
	}

	if (!hostId || !remoteHost || remoteHost.isOnline) return null;
	return (
		<div className={cn(WRAPPER_CLASS, className)}>
			<div className="flex min-w-[240px] flex-1 items-start gap-2">
				{ICON}
				<span>
					<span className="font-medium">{remoteHost.name}</span> isn't connected
					to the Superset relay, so its runs will be skipped. Check its{" "}
					<Link
						to="/settings/hosts/$hostId"
						params={{ hostId }}
						className="font-medium underline underline-offset-2"
					>
						host settings
					</Link>
					, and make sure relay access is on in Settings &gt; Security on that
					device.
				</span>
			</div>
		</div>
	);
}
