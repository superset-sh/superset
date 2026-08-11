import { alert } from "@superset/ui/atoms/Alert";
import type { workspaceTrpc } from "@superset/workspace-client";
import { hasTerminalBackgroundIntent } from "renderer/lib/terminal/terminal-background-intents";
import { useTerminalCloseConfirmStore } from "renderer/stores/terminal-close-confirm/store";

type WorkspaceTrpcUtils = ReturnType<typeof workspaceTrpc.useUtils>;

/**
 * Fetch whether a foreground process is running in a terminal. Probes live
 * state (staleTime: 0), and reports "not running" on any error so a failed
 * probe never blocks the close.
 */
export async function probeTerminalRunning(
	utils: WorkspaceTrpcUtils,
	workspaceId: string,
	terminalId: string,
): Promise<boolean> {
	try {
		const { running } = await utils.terminal.hasRunningProcess.fetch(
			{ terminalId, workspaceId },
			{ staleTime: 0 },
		);
		return running;
	} catch (error) {
		console.warn("Failed to check for running process", {
			terminalId,
			workspaceId,
			error,
		});
		return false;
	}
}

interface ConfirmCloseTerminalsLabels {
	title: string;
	description: string;
	confirmLabel: string;
}

/**
 * Shared "a process is still running" confirm for closing terminal(s) — used by
 * both single-pane close and tab close so the guard can't be bypassed by the
 * tab-close gesture. Returns true when the close should proceed. Suppressed,
 * backgrounded, and idle terminals resolve true without prompting; a probe that
 * throws is treated as not-running so it never blocks the close.
 */
export async function confirmCloseTerminals(
	terminalIds: string[],
	isRunning: (terminalId: string) => Promise<boolean>,
	labels: ConfirmCloseTerminalsLabels,
): Promise<boolean> {
	if (useTerminalCloseConfirmStore.getState().suppressed) return true;

	let running = false;
	for (const terminalId of terminalIds) {
		// Backgrounded terminals stay alive on close, so nothing is killed.
		if (hasTerminalBackgroundIntent(terminalId)) continue;
		try {
			if (await isRunning(terminalId)) {
				running = true;
				break;
			}
		} catch {
			// If we can't tell, don't block the user from closing.
		}
	}
	if (!running) return true;

	return new Promise<boolean>((resolve) => {
		const shown = alert({
			title: labels.title,
			description: labels.description,
			checkbox: { label: "Don't ask again" },
			onDismiss: () => resolve(false),
			actions: [
				{
					label: labels.confirmLabel,
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
		// Fail open if the dialog layer isn't available, so the close can't hang.
		if (!shown) resolve(true);
	});
}
