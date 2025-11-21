import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

export const Terminal = () => {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);

	useEffect(() => {
		if (!terminalRef.current) return;

		// Create xterm instance
		const xterm = new XTerm({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: "#000000",
				foreground: "#d4d4d4",
				cursor: "#d4d4d4",
				black: "#000000",
				red: "#cd3131",
				green: "#0dbc79",
				yellow: "#e5e510",
				blue: "#2472c8",
				magenta: "#bc3fbc",
				cyan: "#11a8cd",
				white: "#e5e5e5",
				brightBlack: "#666666",
				brightRed: "#f14c4c",
				brightGreen: "#23d18b",
				brightYellow: "#f5f543",
				brightBlue: "#3b8eea",
				brightMagenta: "#d670d6",
				brightCyan: "#29b8db",
				brightWhite: "#e5e5e5",
			},
			allowProposedApi: true,
		});

		// Create and load addons
		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();

		xterm.loadAddon(fitAddon);
		xterm.loadAddon(webLinksAddon);

		// Open terminal in the DOM
		xterm.open(terminalRef.current);

		// Fit terminal to container
		fitAddon.fit();

		// Store references
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;

		// Write some demo text
		xterm.writeln("Welcome to Superset Terminal!");
		xterm.writeln("");
		xterm.writeln("This is a demo terminal using xterm.js");
		xterm.writeln("Backend integration coming soon...");
		xterm.writeln("");
		xterm.write("$ ");

		// Handle user input (echo back for now)
		xterm.onData((data) => {
			// Handle special keys
			if (data === "\r") {
				// Enter key
				xterm.write("\r\n$ ");
			} else if (data === "\u007F") {
				// Backspace
				xterm.write("\b \b");
			} else if (data === "\u0003") {
				// Ctrl+C
				xterm.write("^C");
				xterm.write("\r\n$ ");
			} else {
				// Echo the character
				xterm.write(data);
			}
		});

		// Handle window resize
		const handleResize = () => {
			fitAddon.fit();
		};

		window.addEventListener("resize", handleResize);

		// Cleanup
		return () => {
			window.removeEventListener("resize", handleResize);
			xterm.dispose();
		};
	}, []);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full p-2" />
		</div>
	);
};
