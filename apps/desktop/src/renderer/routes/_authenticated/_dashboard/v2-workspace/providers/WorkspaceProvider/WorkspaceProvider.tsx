import type { SelectV2Workspace } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createContext, type ReactNode, useContext } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { WorkspaceTrpcProvider } from "../WorkspaceTrpcProvider";

interface WorkspaceContextValue {
	workspace: SelectV2Workspace;
	hostUrl: string;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
	workspace,
	children,
}: {
	workspace: SelectV2Workspace;
	children: ReactNode;
}) {
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const hostUrl =
		workspace.hostId === machineId
			? activeHostUrl
			: `${relayUrl}/hosts/${buildHostRoutingKey(
					workspace.organizationId,
					workspace.hostId,
				)}`;

	if (!hostUrl) {
		return <div className="flex h-full w-full" />;
	}

	return (
		<WorkspaceContext.Provider value={{ workspace, hostUrl }}>
			<WorkspaceTrpcProvider
				cacheKey={workspace.id}
				key={`${workspace.id}:${hostUrl}`}
				hostUrl={hostUrl}
				headers={() => getHostServiceHeaders(hostUrl)}
				wsToken={() => getHostServiceWsToken(hostUrl)}
			>
				{children}
			</WorkspaceTrpcProvider>
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceContextValue {
	const ctx = useContext(WorkspaceContext);
	if (!ctx) {
		throw new Error("useWorkspace must be used within WorkspaceProvider");
	}
	return ctx;
}
