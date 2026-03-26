import { Button } from "@superset/ui/button";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	useWorkspaceHostUrl,
	useWorkspaceSessionToken,
} from "../../../providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";

interface WorkspaceTerminalProps {
	workspaceId: string;
}

type TerminalServerMessage =
	| {
			type: "data";
			data: string;
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: "exit";
			exitCode: number;
			signal: number;
	  };

export function WorkspaceTerminal({ workspaceId }: WorkspaceTerminalProps) {
	const hostUrl = useWorkspaceHostUrl();
	const sessionToken = useWorkspaceSessionToken();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [connectionState, setConnectionState] = useState<
		"connecting" | "open" | "closed"
	>("connecting");
	const [reconnectKey, setReconnectKey] = useState(0);

	const websocketUrl = useMemo(() => {
		const url = new URL(`/terminal/${workspaceId}`, hostUrl);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.searchParams.set("reconnect", String(reconnectKey));
		if (sessionToken) {
			url.searchParams.set("sessionToken", sessionToken);
		}
		return url.toString();
	}, [hostUrl, reconnectKey, sessionToken, workspaceId]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const fitAddon = new FitAddon();
		const terminal = new XTerm({
			cursorBlink: true,
			fontFamily:
				'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
			fontSize: 12,
			theme: {
				background: "#14100f",
				foreground: "#f5efe9",
			},
		});
		terminal.loadAddon(fitAddon);
		terminal.open(container);
		fitAddon.fit();
		terminal.focus();

		setConnectionState("connecting");
		const socket = new WebSocket(websocketUrl);

		const sendResize = () => {
			if (socket.readyState !== WebSocket.OPEN) {
				return;
			}

			socket.send(
				JSON.stringify({
					type: "resize",
					cols: terminal.cols,
					rows: terminal.rows,
				}),
			);
		};

		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
			sendResize();
		});
		resizeObserver.observe(container);

		const onTerminalDataDispose = terminal.onData((data) => {
			if (socket.readyState !== WebSocket.OPEN) {
				return;
			}

			socket.send(
				JSON.stringify({
					type: "input",
					data,
				}),
			);
		});

		socket.addEventListener("open", () => {
			setConnectionState("open");
			sendResize();
		});

		socket.addEventListener("message", (event) => {
			let message: TerminalServerMessage;
			try {
				message = JSON.parse(String(event.data)) as TerminalServerMessage;
			} catch {
				terminal.writeln("\r\n[terminal] invalid server payload");
				return;
			}

			if (message.type === "data") {
				terminal.write(message.data);
				return;
			}

			if (message.type === "error") {
				terminal.writeln(`\r\n[terminal] ${message.message}`);
				return;
			}

			terminal.writeln(
				`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
			);
		});

		socket.addEventListener("close", () => {
			setConnectionState("closed");
		});

		socket.addEventListener("error", () => {
			terminal.writeln("\r\n[terminal] websocket error");
		});

		return () => {
			resizeObserver.disconnect();
			onTerminalDataDispose.dispose();
			socket.close();
			terminal.dispose();
		};
	}, [websocketUrl]);

	return (
		<div className="w-full rounded-lg border border-border p-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<h2 className="text-sm font-medium">terminal</h2>
					<p className="text-xs text-muted-foreground">
						{connectionState === "open"
							? "Connected"
							: connectionState === "connecting"
								? "Connecting..."
								: "Disconnected"}
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => setReconnectKey((value) => value + 1)}
				>
					Reconnect
				</Button>
			</div>
			<div
				ref={containerRef}
				className="h-[360px] overflow-hidden rounded-md border border-border bg-[#14100f] p-2"
			/>
		</div>
	);
}
