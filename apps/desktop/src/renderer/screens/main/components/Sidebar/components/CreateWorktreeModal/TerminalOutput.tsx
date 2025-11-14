import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";

interface TerminalOutputProps {
	output: string;
	className?: string;
}

export function TerminalOutput({ output, className }: TerminalOutputProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const lastOutputRef = useRef<string>("");

	useEffect(() => {
		if (!terminalRef.current) return;

		// Initialize terminal only once
		if (!xtermRef.current) {
			const terminal = new Terminal({
				convertEol: true,
				cursorBlink: false,
				disableStdin: true,
				theme: {
					background: "#171717", // neutral-900
					foreground: "#d4d4d4", // neutral-300
				},
				fontSize: 12,
				fontFamily:
					'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
			});

			const fitAddon = new FitAddon();
			terminal.loadAddon(fitAddon);
			terminal.open(terminalRef.current);
			fitAddon.fit();

			xtermRef.current = terminal;
			fitAddonRef.current = fitAddon;

			// Resize observer to fit terminal when container size changes
			const resizeObserver = new ResizeObserver(() => {
				fitAddon.fit();
			});
			resizeObserver.observe(terminalRef.current);

			return () => {
				resizeObserver.disconnect();
				terminal.dispose();
				xtermRef.current = null;
				fitAddonRef.current = null;
			};
		}
	}, []);

	useEffect(() => {
		const terminal = xtermRef.current;
		if (!terminal) return;

		// Only update if output changed
		if (output === lastOutputRef.current) return;

		// If output is an extension of previous output, append only new content
		if (lastOutputRef.current && output.startsWith(lastOutputRef.current)) {
			const newContent = output.slice(lastOutputRef.current.length);
			if (newContent) {
				terminal.write(newContent);
			}
		} else {
			// Output changed completely or is new, clear and write everything
			terminal.clear();
			if (output) {
				terminal.write(output);
			}
		}

		lastOutputRef.current = output;
	}, [output]);

	return (
		<div
			ref={terminalRef}
			className={className}
			style={{ width: "100%", height: "100%" }}
		/>
	);
}
