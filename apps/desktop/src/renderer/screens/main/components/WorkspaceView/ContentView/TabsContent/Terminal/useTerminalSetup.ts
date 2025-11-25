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

		// Print copy results if available
		if (setupCopyResults) {
			const { copied, errors } = setupCopyResults;
			if (copied.length > 0) {
				session.xterm.writeln(
					`\r\n\x1b[32m✓ Copied ${copied.length} file(s):\x1b[0m`,
				);
				for (const file of copied) {
					session.xterm.writeln(`  - ${file}`);
				}
			}
			if (errors.length > 0) {
				session.xterm.writeln(`\r\n\x1b[33m⚠ Copy warnings:\x1b[0m`);
				for (const error of errors) {
					session.xterm.writeln(`  ${error}`);
				}
			}
			session.xterm.writeln("\r\n");
		}

		// Send all commands sequentially
		const commands = `${setupCommands.join("\n")}\n`;
		session.write(commands);

		// Mark setup as no longer pending
		useTabsStore.setState((state) => ({
			tabs: state.tabs.map((t) =>
				t.id === tabId ? { ...t, setupPending: false } : t,
			),
		}));
	};

	return { executeSetup };
}
