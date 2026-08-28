import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { PortForward } from "shared/types";
import { portForwardId } from "shared/types";
import type { DashboardSidebarPort } from "../../hooks/useDashboardSidebarPortsData";
import { portForwardClientId } from "../../utils/portForwardClientId";

const PortForwardsContext = createContext<Map<string, PortForward> | null>(
	null,
);

/** Mirrors the main process's port-forward list; one subscription per window. */
export function PortForwardsProvider({ children }: { children: ReactNode }) {
	const [forwards, setForwards] = useState<PortForward[]>([]);
	// clientId ties this window's subscription lifetime to its wanted
	// forwards in main: window closes -> subscription tears down -> released.
	electronTrpc.portForwards.subscribe.useSubscription(
		{ clientId: portForwardClientId },
		{ onData: setForwards },
	);
	const byId = useMemo(
		() => new Map(forwards.map((f) => [f.id, f])),
		[forwards],
	);
	return (
		<PortForwardsContext.Provider value={byId}>
			{children}
		</PortForwardsContext.Provider>
	);
}

/** The forward for a sidebar port row, or null when none runs for it. */
export function usePortForward(port: DashboardSidebarPort): PortForward | null {
	const byId = useContext(PortForwardsContext);
	if (!byId || port.hostType !== "remote-device") return null;
	return (
		byId.get(
			portForwardId({
				hostUrl: port.hostUrl,
				workspaceId: port.workspaceId,
				remotePort: port.port,
			}),
		) ?? null
	);
}
