import { useCallback, useEffect, useState } from "react";
import type { McpOverviewPayload } from "../../../../ChatPane/ChatInterface/types";

export interface UseMcpUiOptions {
	cwd: string;
	loadOverview: (cwd: string) => Promise<McpOverviewPayload>;
	authenticateServer?: (
		cwd: string,
		serverName: string,
	) => Promise<McpOverviewPayload>;
	onSetErrorMessage: (message: string) => void;
	onClearError: () => void;
	onTrackEvent?: (event: string, properties: Record<string, unknown>) => void;
	pollIntervalMs?: number;
}

export interface UseMcpUiReturn {
	overview: McpOverviewPayload | null;
	overviewOpen: boolean;
	isOverviewLoading: boolean;
	authenticatingServerName: string | null;
	showOverview: (overview: McpOverviewPayload) => void;
	setOverviewOpen: (open: boolean) => void;
	openOverview: () => Promise<void>;
	refreshOverview: () => Promise<void>;
	authenticateServer: (serverName: string) => Promise<void>;
	resetUi: () => void;
}

export function useMcpUi({
	cwd,
	loadOverview,
	authenticateServer,
	onSetErrorMessage,
	onClearError,
	onTrackEvent,
	pollIntervalMs = 5_000,
}: UseMcpUiOptions): UseMcpUiReturn {
	const [overview, setOverview] = useState<McpOverviewPayload | null>(null);
	const [overviewOpen, setOverviewOpen] = useState(false);
	const [isOverviewLoading, setIsOverviewLoading] = useState(false);
	const [authenticatingServerName, setAuthenticatingServerName] = useState<
		string | null
	>(null);

	const resetUi = useCallback(() => {
		setOverview(null);
		setOverviewOpen(false);
		setAuthenticatingServerName(null);
	}, []);

	const showOverview = useCallback(
		(nextOverview: McpOverviewPayload) => {
			setOverview(nextOverview);
			setOverviewOpen(true);
			const servers = nextOverview.servers ?? [];
			onTrackEvent?.("chat_mcp_overview_opened", {
				server_count: servers.length,
				enabled_count: servers.filter((s) => s.state === "enabled").length,
			});
		},
		[onTrackEvent],
	);

	const openOverview = useCallback(async () => {
		if (!cwd) {
			onSetErrorMessage("Workspace path is missing");
			return;
		}
		setIsOverviewLoading(true);
		try {
			const nextOverview = await loadOverview(cwd);
			onClearError();
			setOverview(nextOverview);
			setOverviewOpen(true);
		} catch {
			onSetErrorMessage("Failed to load MCP settings");
		} finally {
			setIsOverviewLoading(false);
		}
	}, [cwd, loadOverview, onClearError, onSetErrorMessage]);

	const refreshOverview = useCallback(async () => {
		if (!cwd) return;
		try {
			const nextOverview = await loadOverview(cwd);
			setOverview(nextOverview);
		} catch {
			// Keep existing overview when background refresh fails.
		}
	}, [cwd, loadOverview]);

	const authenticateMcpServer = useCallback(
		async (serverName: string) => {
			if (!cwd) {
				onSetErrorMessage("Workspace path is missing");
				return;
			}

			setAuthenticatingServerName(serverName);
			try {
				const nextOverview = authenticateServer
					? await authenticateServer(cwd, serverName)
					: await loadOverview(cwd);
				onClearError();
				setOverview(nextOverview);
				onTrackEvent?.("chat_mcp_server_auth_triggered", {
					server_name: serverName,
				});
			} catch {
				onSetErrorMessage(`Failed to authenticate MCP server: ${serverName}`);
			} finally {
				setAuthenticatingServerName(null);
			}
		},
		[
			cwd,
			authenticateServer,
			loadOverview,
			onClearError,
			onSetErrorMessage,
			onTrackEvent,
		],
	);

	useEffect(() => {
		if (!overviewOpen || !cwd) return;
		const intervalId = setInterval(() => {
			void refreshOverview();
		}, pollIntervalMs);
		return () => clearInterval(intervalId);
	}, [cwd, overviewOpen, pollIntervalMs, refreshOverview]);

	return {
		overview,
		overviewOpen,
		isOverviewLoading,
		authenticatingServerName,
		showOverview,
		setOverviewOpen,
		openOverview,
		refreshOverview,
		authenticateServer: authenticateMcpServer,
		resetUi,
	};
}
