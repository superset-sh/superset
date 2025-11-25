import { useTabs } from "renderer/stores";
import { Terminal } from "./Terminal";
import type { TerminalSession } from "./types";
import { useTerminalSetup } from "./useTerminalSetup";

interface SetupTerminalProps {
	tabId: string;
	workspaceId: string;
}

/**
 * Wrapper component that handles terminal setup logic.
 * Reads setup metadata from the tab store and executes setup when the terminal session is ready.
 */
export function SetupTerminal({ tabId, workspaceId }: SetupTerminalProps) {
	const tabs = useTabs();
	const tab = tabs.find((t) => t.id === tabId);

	const { executeSetup } = useTerminalSetup({
		tabId,
		setupPending: tab?.setupPending,
		setupCommands: tab?.setupCommands,
		setupCopyResults: tab?.setupCopyResults,
	});

	const handleSessionReady = (session: TerminalSession) => {
		// Execute setup with the terminal session
		executeSetup(session);
	};

	return (
		<Terminal
			tabId={tabId}
			workspaceId={workspaceId}
			title={tab?.title}
			onSessionReady={handleSessionReady}
		/>
	);
}
