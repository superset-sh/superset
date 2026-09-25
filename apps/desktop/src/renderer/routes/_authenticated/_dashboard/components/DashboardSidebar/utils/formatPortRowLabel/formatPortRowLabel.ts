import type { PortForward } from "shared/types";
import type { DashboardSidebarPort } from "../../hooks/useDashboardSidebarPortsData";

/**
 * The address column of a port row. Local ports read as before; remote ports
 * say whether, and where, they reach the local machine.
 */
export function formatPortRowLabel({
	port,
	forward,
}: {
	port: DashboardSidebarPort;
	forward: PortForward | null;
}): { text: string; title?: string } {
	if (port.hostType === "local-device") {
		return { text: `localhost:${port.port}` };
	}
	if (!forward) return { text: `${port.port} · remote` };
	switch (forward.status.state) {
		case "active":
			return forward.status.localPort === port.port
				? { text: `${port.port} · forwarded` }
				: { text: `${port.port} → localhost:${forward.status.localPort}` };
		case "busy":
			return { text: `${port.port} · local port busy` };
		case "error":
			return {
				text: `${port.port} · ${forward.status.message}`,
				title: forward.status.message,
			};
	}
}
