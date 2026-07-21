import type { DesktopNoticeCta } from "@superset/shared/desktop-notices";
import { useAutoUpdateStatus } from "renderer/components/UpdatesPill/useAutoUpdateStatus";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";

/** Runs a notice CTA: installs a ready update (or kicks off a check), or opens a URL. */
export function useNoticeCta() {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const install = electronTrpc.autoUpdate.install.useMutation();
	const check = electronTrpc.autoUpdate.check.useMutation();
	const updateEvent = useAutoUpdateStatus();

	return (cta: DesktopNoticeCta | null | undefined) => {
		if (!cta) return;
		if (cta.action === "open-url") {
			if (cta.url) openUrl.mutate(cta.url);
			return;
		}
		if (updateEvent?.status === AUTO_UPDATE_STATUS.READY) {
			install.mutate();
		} else {
			check.mutate();
		}
	};
}
