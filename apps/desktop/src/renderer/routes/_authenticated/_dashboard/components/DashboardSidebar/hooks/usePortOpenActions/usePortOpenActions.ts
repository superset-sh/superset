import { useNavigate } from "@tanstack/react-router";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { PortForward } from "shared/types";
import { usePortForward } from "../../providers/PortForwardsProvider";
import type { DashboardSidebarPort } from "../useDashboardSidebarPortsData";

type OpenablePort = Pick<
	DashboardSidebarPort,
	"port" | "hostType" | "workspaceId" | "terminalId"
>;

/**
 * Where this machine reaches the port, or null when it can't: a remote port
 * opens like a local one only once the main process forwards it, and the
 * local port number may differ from the remote one.
 */
export function getPortBrowserUrl(
	port: Pick<DashboardSidebarPort, "port" | "hostType">,
	forward: Pick<PortForward, "status"> | null,
): string | null {
	const localPort =
		forward?.status.state === "active" ? forward.status.localPort : null;
	if (port.hostType !== "local-device" && localPort === null) return null;
	return `http://localhost:${localPort ?? port.port}`;
}

/**
 * Opens a port the way a plain click does: in the browser configured under
 * Settings → Links → Ports, or, for a remote port that isn't forwarded, by
 * jumping to the terminal that serves it.
 */
export function usePortOpener() {
	const navigate = useNavigate();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { preferences } = useV2UserPreferences();

	const openExternal = (url: string) => {
		if (!openUrl.isPending) openUrl.mutate(url);
	};

	const openPort = (
		port: OpenablePort,
		forward: Pick<PortForward, "status"> | null,
	) => {
		const url = getPortBrowserUrl(port, forward);
		if (url === null) {
			void navigateToV2Workspace(port.workspaceId, navigate, {
				search: {
					terminalId: port.terminalId,
					focusRequestId: crypto.randomUUID(),
				},
			});
			return;
		}
		if (preferences.portOpenAction === "external") {
			openExternal(url);
			return;
		}
		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				openUrl: url,
				openUrlTarget:
					preferences.portOpenAction === "newTab" ? "new-tab" : "current-tab",
				openUrlRequestId: crypto.randomUUID(),
			},
		});
	};

	return { openPort, openExternal };
}

export function usePortOpenActions(port: DashboardSidebarPort) {
	const forward = usePortForward(port);
	const { openPort, openExternal } = usePortOpener();
	const browserUrl = getPortBrowserUrl(port, forward);

	return {
		canOpenInBrowser: browserUrl !== null,
		portUrl: browserUrl ?? `http://localhost:${port.port}`,
		openExternal: () => {
			if (browserUrl !== null) openExternal(browserUrl);
		},
		openPrimary: () => openPort(port, forward),
	};
}
