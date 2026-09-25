import { useNavigate } from "@tanstack/react-router";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { LinkAction } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { usePortForward } from "../../providers/PortForwardsProvider";
import type { DashboardSidebarPort } from "../useDashboardSidebarPortsData";

interface UsePortOpenActionsResult {
	canOpenInBrowser: boolean;
	portUrl: string;
	isOpenExternalPending: boolean;
	portOpenAction: LinkAction;
	openExternal: () => void;
	openInApp: (target: "new-tab" | "current-tab") => void;
	openInBrowser: () => void;
	openWorkspace: () => void;
	openPrimary: () => void;
}

export function usePortOpenActions(
	port: DashboardSidebarPort,
): UsePortOpenActionsResult {
	const navigate = useNavigate();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { preferences } = useV2UserPreferences();
	// A remote port opens like a local one once the main process forwards it
	// to this machine; the local port number may differ from the remote one.
	const forward = usePortForward(port);
	const activeForward =
		forward?.status.state === "active" ? forward.status : null;
	const canOpenInBrowser =
		port.hostType === "local-device" || activeForward !== null;
	const portUrl = `http://localhost:${activeForward?.localPort ?? port.port}`;

	const openExternal = () => {
		if (!canOpenInBrowser || openUrl.isPending) return;
		openUrl.mutate(portUrl);
	};

	const openInApp = (target: "new-tab" | "current-tab") => {
		if (!canOpenInBrowser) return;
		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				openUrl: portUrl,
				openUrlTarget: target,
				openUrlRequestId: crypto.randomUUID(),
			},
		});
	};

	// Where a plain click opens the port is configurable under
	// Settings → Links → Ports.
	const openInBrowser = () => {
		if (preferences.portOpenAction === "external") {
			openExternal();
			return;
		}
		openInApp(
			preferences.portOpenAction === "newTab" ? "new-tab" : "current-tab",
		);
	};

	const openWorkspace = () => {
		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				terminalId: port.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	// Opening the port is the primary action; a remote port that is not
	// forwarded can't open a local browser tab, so clicking it jumps to the
	// workspace instead.
	const openPrimary = canOpenInBrowser ? openInBrowser : openWorkspace;

	return {
		canOpenInBrowser,
		portUrl,
		isOpenExternalPending: openUrl.isPending,
		portOpenAction: preferences.portOpenAction,
		openExternal,
		openInApp,
		openInBrowser,
		openWorkspace,
		openPrimary,
	};
}
