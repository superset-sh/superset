import { toast } from "@superset/ui/sonner";
import { useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { UpdateToast } from "./UpdateToast";

/**
 * Hook that listens for auto-update status changes via tRPC subscription.
 * Shows a toast notification when downloading or ready to install.
 */
export function useUpdateListener() {
	const toastIdRef = useRef<string | number | null>(null);

	trpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: (event) => {
			const { status, version } = event;

			// Dismiss existing toast if status changed to idle/checking/error
			if (
				status === AUTO_UPDATE_STATUS.IDLE ||
				status === AUTO_UPDATE_STATUS.CHECKING ||
				status === AUTO_UPDATE_STATUS.ERROR
			) {
				if (toastIdRef.current !== null) {
					toast.dismiss(toastIdRef.current);
					toastIdRef.current = null;
				}
				return;
			}

			// Show toast for downloading or ready states
			if (
				status === AUTO_UPDATE_STATUS.DOWNLOADING ||
				status === AUTO_UPDATE_STATUS.READY
			) {
				// Dismiss existing toast before showing new one
				if (toastIdRef.current !== null) {
					toast.dismiss(toastIdRef.current);
				}

				const toastId = toast.custom(
					(id) => (
						<UpdateToast
							toastId={id}
							status={status}
							version={version}
						/>
					),
					{
						duration: Number.POSITIVE_INFINITY,
						position: "bottom-right",
						unstyled: true,
					},
				);

				toastIdRef.current = toastId;
			}
		},
	});
}
