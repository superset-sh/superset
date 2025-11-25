import { useRef } from "react";
import { useTabsStore } from "renderer/stores";
import type { TerminalSession } from "./types";

interface SetupCopyResults {
	copied: string[];
	errors: string[];
}

interface UseTerminalSetupParams {
	tabId: string;
	setupPending?: boolean;
	setupCommands?: string[];
	setupCopyResults?: SetupCopyResults;
}

/**
 * Hook to handle terminal setup execution.
 * Prints copy results and sends setup commands when a terminal session is ready.
 */
export function useTerminalSetup({
	tabId,
	setupPending,
	setupCommands,
	setupCopyResults,
}: UseTerminalSetupParams) {
	const setupExecutedRef = useRef(false);

	const executeSetup = (session: TerminalSession) => {
		// Only execute setup once and only if setup is pending
		if (!setupPending || !setupCommands || setupExecutedRef.current) {
			return;
		}

		setupExecutedRef.current = true;

		// Send each setup command individually to the shell
		for (const command of setupCommands) {
			session.write(`${command}\n`);
		}

		// Write completion message directly to xterm display (not executed)
		setTimeout(() => {
			session.xterm.write(
				"\r\n\x1b[32m✓ Setup completed! You can close this tab.\x1b[0m\r\n",
			);
		}, 100);

		// Mark setup as no longer pending
		useTabsStore.setState((state) => ({
			tabs: state.tabs.map((t) =>
				t.id === tabId ? { ...t, setupPending: false } : t,
			),
		}));
	};

	return { executeSetup };
}
