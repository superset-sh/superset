import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";

/** Enable relay access with the same mutation + feedback as Settings > Remote Access. */
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
			loading: i18n._(
				msg({
					message: "Restarting host services…",
				}),
			),
			success: i18n._(
				msg({
					message: "Relay access enabled, connecting to the relay…",
				}),
			),
			error: (err: Error) =>
				err.message ??
				i18n._(
					msg({
						message: "Failed to enable relay access",
					}),
				),
		});
	};

	return { enableRelay, isPending: setExpose.isPending };
}
