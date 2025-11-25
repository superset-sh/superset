import { Terminal } from "./Terminal";
import type { TerminalSession } from "./types";
import { useTerminalSetup } from "./useTerminalSetup";

interface SetupCopyResults {
	copied: string[];
	errors: string[];
}

interface SetupTerminalProps {
	tabId: string;
	workspaceId: string;
	title?: string;
	setupPending?: boolean;
	setupCommands?: string[];
	setupCopyResults?: SetupCopyResults;
}

/**
 * Wrapper component that handles terminal setup logic.
 * Executes setup when the terminal session is ready.
 */
export function SetupTerminal({
	tabId,
	workspaceId,
	title,
	setupPending,
	setupCommands,
	setupCopyResults,
}: SetupTerminalProps) {
	const { executeSetup } = useTerminalSetup({
		tabId,
		setupPending,
		setupCommands,
		setupCopyResults,
	});

	const handleSessionReady = (session: TerminalSession) => {
		// Build copy result commands as echo statements
		const copyCommands: string[] = [];

		if (setupCopyResults) {
			const { copied, errors } = setupCopyResults;
			if (copied.length > 0) {
				copyCommands.push(
					`echo -e "\\n\\033[32m✓ Copied ${copied.length} file(s):\\033[0m"`,
				);
				for (const file of copied) {
					copyCommands.push(`echo "  - ${file}"`);
				}
			}
			if (errors.length > 0) {
				copyCommands.push(`echo -e "\\n\\033[33m⚠ Copy warnings:\\033[0m"`);
				for (const error of errors) {
					copyCommands.push(`echo "  ${error}"`);
				}
			}
			if (copied.length > 0 || errors.length > 0) {
				copyCommands.push(`echo ""`);
			}
		}

		// Send copy result commands first
		for (const cmd of copyCommands) {
			session.write(`${cmd}\n`);
		}

		// Execute setup with the terminal session
		executeSetup(session);
	};

	return (
		<Terminal
			tabId={tabId}
			workspaceId={workspaceId}
			title={title}
			onSessionReady={handleSessionReady}
		/>
	);
}
