import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";

/** Enable relay access with the same mutation + feedback as Settings > Security. */
export function useEnableRelayAccess() {
	const utils = electronTrpc.useUtils();
	const setExpose =
		electronTrpc.settings.setExposeHostServiceViaRelay.useMutation({
			onSettled: () => {
				utils.settings.getExposeHostServiceViaRelay.invalidate();
			},
		});

	const enableRelay = () => {
		toast.promise(setExpose.mutateAsync({ enabled: true }), {
			loading: "Restarting host services…",
			success: "Relay access enabled, connecting to the relay…",
			error: (err: Error) => err.message ?? "Failed to enable relay access",
		});
	};

	return { enableRelay, isPending: setExpose.isPending };
}
