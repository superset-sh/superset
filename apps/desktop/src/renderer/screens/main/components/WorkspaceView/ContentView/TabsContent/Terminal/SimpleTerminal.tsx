import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";

interface SetupCopyResults {
	copied: string[];
	errors: string[];
}

interface SimpleTerminalProps {
	tabId: string;
	workspaceId: string;
	setupCommands?: string[];
	setupCopyResults?: SetupCopyResults;
	setupCwd?: string;
}

/**
 * Simple terminal that displays output without PTY.
 * Used for setup tabs where we just need to show command output.
 */
export function SimpleTerminal({
	setupCommands,
	setupCopyResults,
	setupCwd,
}: SimpleTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		// Create xterm instance
		const xterm = new XTerm({
			cursorBlink: false,
			fontSize: 13,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: "#000000",
			},
			allowProposedApi: true,
		});

		const fitAddon = new FitAddon();
		xterm.loadAddon(fitAddon);
		xterm.open(container);
		fitAddon.fit();

		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;

		// Display copy results
		if (setupCopyResults) {
			const { copied, errors } = setupCopyResults;
			if (copied.length > 0) {
				xterm.writeln(
					`\r\n\x1b[32m✓ Copied ${copied.length} file(s):\x1b[0m`,
				);
				for (const file of copied) {
					xterm.writeln(`  - ${file}`);
				}
			}
			if (errors.length > 0) {
				xterm.writeln(`\r\n\x1b[33m⚠ Copy warnings:\x1b[0m`);
				for (const error of errors) {
					xterm.writeln(`  ${error}`);
				}
			}
			xterm.writeln("");
		}

		// Display working directory
		if (setupCwd) {
			xterm.writeln(`\x1b[36mWorking directory: ${setupCwd}\x1b[0m\r\n`);
		}

		// Display commands that will be run
		if (setupCommands && setupCommands.length > 0) {
			xterm.writeln(`\x1b[36mRunning setup commands...\x1b[0m\r\n`);
			for (const cmd of setupCommands) {
				xterm.writeln(`$ ${cmd}`);
			}
			xterm.writeln("");
			xterm.writeln(
				`\x1b[33m[Commands are running in the background...]\x1b[0m`,
			);
			xterm.writeln(
				`\x1b[32m✓ Setup completed! You can close this tab.\x1b[0m\r\n`,
			);
		}

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			xterm.dispose();
			xtermRef.current = null;
		};
	}, [setupCommands, setupCopyResults, setupCwd]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
}
