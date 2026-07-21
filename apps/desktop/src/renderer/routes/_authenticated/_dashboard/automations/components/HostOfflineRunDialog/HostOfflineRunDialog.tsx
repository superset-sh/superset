import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { ExposeViaRelayConfirmDialog } from "renderer/routes/_authenticated/components/ExposeViaRelayConfirmDialog";
import { useEnableRelayAccess } from "../../hooks/useEnableRelayAccess";
import { useRelayHostTarget } from "../../hooks/useRelayHostTarget";

interface HostOfflineRunDialogProps {
	hostId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Shown when "Run now" is skipped because the target host isn't connected to
 * the relay. For the local device it offers enabling relay access in place
 * (same typed confirmation as Settings > Security).
 */
export function HostOfflineRunDialog({
	hostId,
	open,
	onOpenChange,
}: HostOfflineRunDialogProps) {
	const { isLocal, remoteHost } = useRelayHostTarget(hostId);
	const { gateFeature } = usePaywall();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const { enableRelay, isPending } = useEnableRelayAccess();

	const handleConfirm = () => {
		setConfirmOpen(false);
		onOpenChange(false);
		enableRelay();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[440px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<LuTriangleAlert
							className="size-4 shrink-0 text-amber-500"
							aria-hidden="true"
						/>
						Target host is offline
					</DialogTitle>
					<DialogDescription asChild>
						<div className="select-text cursor-text space-y-2 pt-1 text-sm leading-relaxed">
							{isLocal ? (
								<p>
									The run was skipped because this device isn't connected to the
									Superset relay. Automations go through the relay even when
									they run on this device. Enable relay access, then run it
									again.
								</p>
							) : (
								<p>
									The run was skipped because{" "}
									<span className="font-medium text-foreground">
										{remoteHost?.name ?? "the target host"}
									</span>{" "}
									isn't connected to the Superset relay. Make sure relay access
									is on in Settings &gt; Security on that device, then run it
									again.
								</p>
							)}
						</div>
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="ghost">{isLocal ? "Cancel" : "Close"}</Button>
					</DialogClose>
					{isLocal ? (
						<Button
							disabled={isPending}
							onClick={() =>
								gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, () =>
									setConfirmOpen(true),
								)
							}
						>
							Enable relay access…
						</Button>
					) : (
						hostId && (
							<Button asChild>
								<Link
									to="/settings/hosts/$hostId"
									params={{ hostId }}
									onClick={() => onOpenChange(false)}
								>
									Host settings
								</Link>
							</Button>
						)
					)}
				</DialogFooter>

				<ExposeViaRelayConfirmDialog
					open={confirmOpen}
					targetEnabled
					onOpenChange={setConfirmOpen}
					onConfirm={handleConfirm}
				/>
			</DialogContent>
		</Dialog>
	);
}
