import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { dialog } from "electron";
import { quitAppCompletely } from "main/index";

export async function confirmAndQuitCompletely(): Promise<void> {
	try {
		const { response } = await dialog.showMessageBox({
			type: "warning",
			buttons: [
				i18n._(
					msg({
						message: "Quit Completely",
					}),
				),
				i18n._(msg({ message: "Cancel" })),
			],
			defaultId: 1,
			cancelId: 1,
			title: i18n._(
				msg({
					message: "Quit Superset Completely",
				}),
			),
			message: i18n._(
				msg({
					message: "Quit Superset and stop all background services?",
				}),
			),
			detail: i18n._(
				msg({
					message:
						"All open terminal sessions will be killed and any running host-services will be stopped. Use “Close Superset” instead if you want services to keep running for the next launch.",
				}),
			),
		});
		if (response === 0) {
			quitAppCompletely();
		}
	} catch (error) {
		console.error("[quit] Quit-completely confirmation failed:", error);
	}
}
