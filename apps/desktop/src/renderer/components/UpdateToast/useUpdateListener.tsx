import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { UpdateToast } from "./UpdateToast";

export function useUpdateListener(options: { enabled?: boolean } = {}) {
	const enabled = options.enabled ?? true;
	const toastIdRef = useRef<string | number | null>(null);

	useEffect(() => {
		if (!enabled && toastIdRef.current !== null) {
			toast.dismiss(toastIdRef.current);
			toastIdRef.current = null;
		}
	}, [enabled]);

	trpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (!enabled) return;
			const { status, version, error } = event;

			if (
				status === AUTO_UPDATE_STATUS.IDLE ||
				status === AUTO_UPDATE_STATUS.CHECKING
			) {
				if (toastIdRef.current !== null) {
					toast.dismiss(toastIdRef.current);
					toastIdRef.current = null;
				}
				return;
			}

			if (
				status === AUTO_UPDATE_STATUS.DOWNLOADING ||
				status === AUTO_UPDATE_STATUS.READY ||
				status === AUTO_UPDATE_STATUS.ERROR
			) {
				if (toastIdRef.current !== null) {
					toast.dismiss(toastIdRef.current);
				}

				const toastId = toast.custom(
					(id) => (
						<UpdateToast
							toastId={id}
							status={status}
							version={version}
							error={error}
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
