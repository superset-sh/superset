import { type AlertOptions, alert } from "@superset/ui/atoms/Alert";
import { useTerminalCloseConfirmStore } from "renderer/stores/terminal-close-confirm/store";

type ShowAlert = (options: AlertOptions) => boolean;

/**
 * Confirm before disposing the terminal sessions that own running agents.
 * This shares the running-process suppression preference with terminal and port
 * confirmations so "Don't ask again" behaves consistently.
 */
export function confirmStopAgents(
	agentCount: number,
	showAlert: ShowAlert = alert,
): Promise<boolean> {
	if (agentCount === 0 || useTerminalCloseConfirmStore.getState().suppressed) {
		return Promise.resolve(true);
	}

	const isSingleAgent = agentCount === 1;

	return new Promise<boolean>((resolve) => {
		const shown = showAlert({
			title: isSingleAgent
				? "This agent is still running"
				: "These agents are still running",
			description: isSingleAgent
				? "Stopping this agent will end its terminal session and interrupt any work in progress."
				: "Stopping these agents will end their terminal sessions and interrupt any work in progress.",
			checkbox: { label: "Don't ask again" },
			onDismiss: () => resolve(false),
			actions: [
				{
					label: isSingleAgent ? "Stop agent" : "Stop agents",
					variant: "destructive",
					onClick: ({ checkboxChecked }) => {
						if (checkboxChecked) {
							useTerminalCloseConfirmStore.getState().suppress();
						}
						resolve(true);
					},
				},
				{ label: "Cancel", variant: "ghost", onClick: () => resolve(false) },
			],
		});

		// Match the terminal and port close behavior: never leave the action
		// hanging if the global alert layer is unavailable.
		if (!shown) resolve(true);
	});
}
