import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { type AlertOptions, alert } from "@superset/ui/atoms/Alert";
import { useTerminalCloseConfirmStore } from "renderer/stores/terminal-close-confirm/store";

type ShowAlert = (options: AlertOptions) => boolean;

/**
 * Confirm before terminating the process or processes that own detected ports.
 * This shares the running-process suppression preference with terminal close
 * confirmations so "Don't ask again" behaves consistently.
 */
export function confirmClosePorts(
	portCount: number,
	showAlert: ShowAlert = alert,
): Promise<boolean> {
	if (portCount === 0 || useTerminalCloseConfirmStore.getState().suppressed) {
		return Promise.resolve(true);
	}

	const isSinglePort = portCount === 1;

	return new Promise<boolean>((resolve) => {
		const shown = showAlert({
			title: isSinglePort
				? i18n._(
						msg({
							message: "This port is still in use",
						}),
					)
				: i18n._(
						msg({
							message: "These ports are still in use",
						}),
					),
			description: isSinglePort
				? i18n._(
						msg({
							message: "Closing this port will end the process using it.",
						}),
					)
				: i18n._(
						msg({
							message: "Closing these ports will end the processes using them.",
						}),
					),
			checkbox: {
				label: i18n._(
					msg({
						message: "Don't ask again",
					}),
				),
			},
			onDismiss: () => resolve(false),
			actions: [
				{
					label: isSinglePort
						? i18n._(
								msg({
									message: "Close port",
								}),
							)
						: i18n._(
								msg({
									message: "Close ports",
								}),
							),
					variant: "destructive",
					onClick: ({ checkboxChecked }) => {
						if (checkboxChecked) {
							useTerminalCloseConfirmStore.getState().suppress();
						}
						resolve(true);
					},
				},
				{
					label: i18n._(
						msg({
							message: "Cancel",
						}),
					),
					variant: "ghost",
					onClick: () => resolve(false),
				},
			],
		});

		// Match terminal-close behavior: never leave the action hanging if the
		// global alert layer is unavailable.
		if (!shown) resolve(true);
	});
}
