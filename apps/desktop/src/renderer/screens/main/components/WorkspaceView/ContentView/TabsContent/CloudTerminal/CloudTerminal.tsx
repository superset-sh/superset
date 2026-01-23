import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { LuCloud, LuPower } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCloudWorkspace } from "renderer/react-query/cloud-workspaces";
import { useTerminalTheme } from "renderer/stores/theme";

interface CloudTerminalProps {
	paneId: string;
	cloudWorkspaceId: string;
}

/**
 * Cloud Terminal component for SSH connections to cloud workspaces.
 * Uses the cloudTerminal tRPC router for communication.
 */
export function CloudTerminal({
	paneId,
	cloudWorkspaceId,
}: CloudTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const isConnectedRef = useRef(false); // Ref for synchronous callback checks

	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isConnected, setIsConnected] = useState(false); // State for subscription reactivity
	const [isExited, setIsExited] = useState(false);

	const terminalTheme = useTerminalTheme();
	const { cloudWorkspace, isLoading } = useCloudWorkspace(cloudWorkspaceId);

	// tRPC mutations
	const createSession = electronTrpc.cloudTerminal.createSession.useMutation();
	const writeMutation = electronTrpc.cloudTerminal.write.useMutation();
	const resizeMutation = electronTrpc.cloudTerminal.resize.useMutation();

	// Refs for mutations to avoid recreating callbacks
	const writeRef = useRef(writeMutation.mutate);
	writeRef.current = writeMutation.mutate;
	const resizeRef = useRef(resizeMutation.mutate);
	resizeRef.current = resizeMutation.mutate;

	// Stream subscription - uses isConnected state for reactivity
	electronTrpc.cloudTerminal.stream.useSubscription(paneId, {
		enabled: isConnected,
		onData: (event) => {
			const xterm = xtermRef.current;
			if (!xterm) return;

			if (event.type === "data") {
				xterm.write(event.data);
			} else if (event.type === "exit") {
				setIsExited(true);
				xterm.writeln(`\r\n[SSH session exited with code ${event.exitCode}]`);
			} else if (event.type === "error") {
				console.error("[CloudTerminal] Error:", event.error);
				setConnectionError(event.error);
			}
		},
	});

	const connect = useCallback(async () => {
		if (!cloudWorkspace || cloudWorkspace.status !== "running") {
			setConnectionError("Workspace is not running");
			return;
		}

		setIsConnecting(true);
		setConnectionError(null);

		try {
			// Get SSH credentials from the API
			const credentials =
				await apiTrpcClient.cloudWorkspace.getSSHCredentials.query({
					workspaceId: cloudWorkspaceId,
				});

			const xterm = xtermRef.current;
			if (!xterm) throw new Error("Terminal not initialized");

			// Create SSH session
			await createSession.mutateAsync({
				paneId,
				cloudWorkspaceId,
				credentials: {
					host: credentials.host,
					port: credentials.port,
					username: credentials.username,
					token: credentials.token,
				},
				cols: xterm.cols,
				rows: xterm.rows,
			});

			isConnectedRef.current = true;
			setIsConnected(true);
			setIsConnecting(false);
		} catch (error) {
			console.error("[CloudTerminal] Connection failed:", error);
			setConnectionError(
				error instanceof Error ? error.message : "Connection failed",
			);
			setIsConnecting(false);
		}
	}, [cloudWorkspace, cloudWorkspaceId, paneId, createSession]);

	// Initialize terminal
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		let xterm: XTerm | null = null;
		let fitAddon: FitAddon | null = null;

		const initTerminal = async () => {
			const { Terminal } = await import("@xterm/xterm");
			const { FitAddon } = await import("@xterm/addon-fit");

			xterm = new Terminal({
				cursorBlink: true,
				cursorStyle: "block",
				fontFamily: "var(--font-mono), monospace",
				fontSize: 13,
				lineHeight: 1.2,
				theme: terminalTheme ?? undefined,
			});

			fitAddon = new FitAddon();
			xterm.loadAddon(fitAddon);

			xterm.open(container);
			fitAddon.fit();

			xtermRef.current = xterm;
			fitAddonRef.current = fitAddon;

			// Handle input
			xterm.onData((data) => {
				if (!isConnectedRef.current) return;
				writeRef.current({ paneId, data });
			});

			// Handle resize
			const resizeObserver = new ResizeObserver(() => {
				if (fitAddon) {
					fitAddon.fit();
					if (xterm && isConnectedRef.current) {
						resizeRef.current({
							paneId,
							cols: xterm.cols,
							rows: xterm.rows,
						});
					}
				}
			});
			resizeObserver.observe(container);

			// Auto-connect when workspace is ready
			if (cloudWorkspace?.status === "running") {
				connect();
			}

			return () => {
				resizeObserver.disconnect();
			};
		};

		const cleanupPromise = initTerminal();

		return () => {
			cleanupPromise.then((cleanup) => cleanup?.());
			if (xterm) {
				xterm.dispose();
			}
			xtermRef.current = null;
			fitAddonRef.current = null;
			isConnectedRef.current = false;
			setIsConnected(false);
		};
	// Note: terminalTheme is intentionally NOT in deps - theme updates are handled separately below
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cloudWorkspace?.status, connect, paneId]);

	// Update theme without reinitializing terminal
	useEffect(() => {
		const xterm = xtermRef.current;
		if (xterm && terminalTheme) {
			xterm.options.theme = terminalTheme;
		}
	}, [terminalTheme]);

	const handleRetry = () => {
		setConnectionError(null);
		setIsExited(false);
		connect();
	};

	const terminalBg = terminalTheme?.background ?? "#1e1e1e";

	if (isLoading) {
		return (
			<div
				className="h-full w-full flex items-center justify-center"
				style={{ backgroundColor: terminalBg }}
			>
				<div className="text-muted-foreground text-sm">
					Loading workspace...
				</div>
			</div>
		);
	}

	if (!cloudWorkspace) {
		return (
			<div
				className="h-full w-full flex items-center justify-center"
				style={{ backgroundColor: terminalBg }}
			>
				<Card className="gap-3 py-4 px-4 max-w-xs text-center">
					<HiExclamationTriangle className="size-8 text-destructive mx-auto" />
					<p className="text-sm font-medium">Workspace not found</p>
					<p className="text-xs text-muted-foreground">
						The cloud workspace may have been deleted.
					</p>
				</Card>
			</div>
		);
	}

	if (cloudWorkspace.status !== "running") {
		return (
			<div
				className="h-full w-full flex items-center justify-center"
				style={{ backgroundColor: terminalBg }}
			>
				<Card className="gap-3 py-4 px-4 max-w-xs text-center">
					<LuCloud className="size-8 text-muted-foreground mx-auto" />
					<p className="text-sm font-medium">Workspace not running</p>
					<p className="text-xs text-muted-foreground">
						Status: {cloudWorkspace.status}
					</p>
					<p className="text-xs text-muted-foreground">
						Start the workspace to connect.
					</p>
				</Card>
			</div>
		);
	}

	return (
		<div
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
		>
			{isConnecting && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
					<Card className="gap-3 py-4 px-4">
						<div className="flex flex-col items-center text-center gap-1.5">
							<LuCloud className="size-5 text-primary animate-pulse" />
							<p className="text-sm font-medium">Connecting...</p>
							<p className="text-xs text-muted-foreground">
								Establishing SSH connection
							</p>
						</div>
					</Card>
				</div>
			)}

			{connectionError && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
					<Card className="gap-3 py-4 px-4 max-w-xs">
						<div className="flex flex-col items-center text-center gap-1.5">
							<HiExclamationTriangle className="size-5 text-destructive" />
							<p className="text-sm font-medium">Connection failed</p>
							<p className="text-xs text-muted-foreground">{connectionError}</p>
						</div>
						<Button size="sm" className="w-full" onClick={handleRetry}>
							Retry
						</Button>
					</Card>
				</div>
			)}

			{isExited && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
					<Card className="gap-3 py-4 px-4">
						<div className="flex flex-col items-center text-center gap-1.5">
							<LuPower className="size-5 text-muted-foreground" />
							<p className="text-sm font-medium">Session ended</p>
						</div>
						<Button size="sm" className="w-full" onClick={handleRetry}>
							Reconnect
						</Button>
					</Card>
				</div>
			)}

			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
}
