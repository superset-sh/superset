import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";
import { UpdateToast } from "./UpdateToast";

const UPDATE_TOAST_ID = "auto-update";

export function useUpdateListener() {
	electronTrpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: (event) => {
			const { status, version, error } = event;

			if (
				status === AUTO_UPDATE_STATUS.IDLE ||
				status === AUTO_UPDATE_STATUS.CHECKING
			) {
				toast.dismiss(UPDATE_TOAST_ID);
				return;
			}

			if (
				status === AUTO_UPDATE_STATUS.DOWNLOADING ||
				status === AUTO_UPDATE_STATUS.READY ||
				status === AUTO_UPDATE_STATUS.ERROR
			) {
				toast.custom(
					(id) => (
						<UpdateToast
							toastId={id}
							status={status}
							version={version}
							error={error}
						/>
					),
					{
						id: UPDATE_TOAST_ID,
						duration: Number.POSITIVE_INFINITY,
						position: "bottom-right",
						unstyled: true,
					},
				);
			}
		},
	});
}
