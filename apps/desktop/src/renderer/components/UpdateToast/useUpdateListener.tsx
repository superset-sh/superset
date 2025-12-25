import { toast } from "@superset/ui/sonner";
import { useCallback, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { UpdateToast } from "./UpdateToast";

/**
 * Hook that listens for auto-update events via tRPC subscription.
 * Shows a toast notification when an update has been downloaded.
 */
export function useUpdateListener() {
	const toastIdRef = useRef<string | number | null>(null);

	const handleDismiss = useCallback(() => {
		toastIdRef.current = null;
	}, []);

	trpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "update-downloaded" && event.data) {
				// Don't show duplicate toasts
				if (toastIdRef.current !== null) {
					return;
				}

				const { version } = event.data;

				const toastId = toast.custom(
					(id) => (
						<UpdateToast
							toastId={id}
							version={version}
							onDismiss={handleDismiss}
						/>
					),
					{
						duration: Number.POSITIVE_INFINITY,
						position: "bottom-right",
						unstyled: true,
					},
				);

				toastIdRef.current = toastId;
			} else if (event.type === "update-not-available") {
				toast.info("You're on the latest version", {
					position: "bottom-right",
				});
			}
		},
	});
}
