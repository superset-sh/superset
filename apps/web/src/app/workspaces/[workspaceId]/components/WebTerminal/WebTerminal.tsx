"use client";

import { installTerminalWheelEventHandler } from "@superset/shared/terminal-wheel-handler";
import { FitAddon } from "@xterm/addon-fit";
import type { ITheme } from "@xterm/xterm";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { MobileTerminalInput } from "../../../../../components/MobileTerminalInput";
import { getAuthToken } from "../../../../../trpc/auth-token";
import { getRelayUrl } from "../../../../../trpc/relay-url";
import { TerminalConnection } from "./TerminalConnection";

const TERMINAL_THEME: ITheme = {
	background: "#151110",
	foreground: "#eae8e6",
	cursor: "#e07850",
	cursorAccent: "#151110",
	selectionBackground: "rgba(224, 120, 80, 0.25)",
	black: "#151110",
	red: "#dc6b6b",
	green: "#7ec699",
	yellow: "#e5c07b",
	blue: "#61afef",
	magenta: "#c678dd",
	cyan: "#56b6c2",
	white: "#eae8e6",
	brightBlack: "#5c5856",
	brightRed: "#e88888",
	brightGreen: "#98d1a8",
	brightYellow: "#ecd08f",
	brightBlue: "#7ec0f5",
	brightMagenta: "#d494e6",
	brightCyan: "#73c7d3",
	brightWhite: "#ffffff",
};

const TERMINAL_FONT_FAMILY =
	'"JetBrains Mono", "MesloLGS NF", "Menlo", "Monaco", "Courier New", monospace';

interface WebTerminalProps {
	workspaceId: string;
	terminalId: string;
	routingKey: string;
}

type ConnectionState =
	| "connecting"
	| "open"
	| "reconnecting"
	| "error"
	| "exited";

export function WebTerminal({
	workspaceId,
	terminalId,
	routingKey,
}: WebTerminalProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const connectionRef = useRef<TerminalConnection | null>(null);
	const [state, setState] = useState<ConnectionState>("connecting");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const sendSequence = useCallback((sequence: string) => {
		connectionRef.current?.send({ type: "input", data: sequence });
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const visualViewport = window.visualViewport;

		const terminal = new Terminal({
			cursorBlink: true,
			cursorStyle: "block",
			fontFamily: TERMINAL_FONT_FAMILY,
			fontSize: 14,
			scrollback: 5000,
			theme: TERMINAL_THEME,
			allowProposedApi: true,
		});
		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(container);
		// PTYs identify as TERM_PROGRAM=kitty (host-service env), which tells
		// TUIs to expect a native-fidelity wheel report stream — this handler
		// provides it. See @superset/shared/terminal-wheel-handler.
		installTerminalWheelEventHandler(terminal);
		if (window.matchMedia("(pointer: coarse)").matches) {
			const xtermInput = terminal.textarea;
			if (xtermInput) {
				xtermInput.readOnly = true;
				xtermInput.inputMode = "none";
				xtermInput.tabIndex = -1;
			}
		}
		try {
			fitAddon.fit();
		} catch {
			// container may not be sized yet
		}

		const sendResize = () => {
			connectionRef.current?.send({
				type: "resize",
				cols: terminal.cols,
				rows: terminal.rows,
			});
		};

		// Refit on every layout change; the visualViewport listeners are what
		// keep the prompt above the soft keyboard on mobile, since the keyboard
		// resizes the visual viewport rather than the layout viewport.
		const refit = () => {
			try {
				fitAddon.fit();
			} catch {
				return;
			}
			if (resizeTimer !== null) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(sendResize, 150);
		};

		const connection = new TerminalConnection(
			{ workspaceId, terminalId, routingKey },
			{
				onBinary: (bytes) => terminal.write(bytes),
				onControl: (message) => {
					switch (message.type) {
						case "attached":
							setErrorMessage(null);
							setState("open");
							sendResize();
							return;
						case "exit":
							terminal.write(
								`\r\n\x1b[33m[process exited code=${message.exitCode}]\x1b[0m\r\n`,
							);
							setState("exited");
							return;
						case "error":
							setErrorMessage(message.message);
							setState("error");
							return;
						default:
							return;
					}
				},
				onStateChange: (next) => setState(next),
			},
			{ getToken: getAuthToken, relayUrl: getRelayUrl },
		);
		connectionRef.current = connection;
		connection.start();

		terminal.onData((data) => {
			connectionRef.current?.send({ type: "input", data });
		});

		const resizeObserver = new ResizeObserver(refit);
		resizeObserver.observe(container);
		visualViewport?.addEventListener("resize", refit);
		visualViewport?.addEventListener("scroll", refit);

		return () => {
			if (resizeTimer !== null) clearTimeout(resizeTimer);
			resizeObserver.disconnect();
			visualViewport?.removeEventListener("resize", refit);
			visualViewport?.removeEventListener("scroll", refit);
			connection.dispose();
			connectionRef.current = null;
			terminal.dispose();
		};
	}, [workspaceId, terminalId, routingKey]);

	return (
		<div className="flex h-full flex-col">
			<div className="relative flex-1 overflow-hidden">
				<div ref={containerRef} className="absolute inset-0" />
				{state !== "open" && (
					<div
						className="absolute inset-x-0 top-0 px-3 py-1 text-xs"
						style={{ color: "#ecd08f" }}
					>
						{state === "connecting"
							? "Connecting…"
							: state === "reconnecting"
								? "Reconnecting…"
								: state === "exited"
									? "Process exited."
									: (errorMessage ?? "Disconnected.")}
					</div>
				)}
			</div>
			<MobileTerminalInput onSend={sendSequence} visibility="always" />
		</div>
	);
}
