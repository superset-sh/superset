import type { SelectV2Workspace } from "@superset/db/schema";
import { WorkspaceClientProvider } from "@superset/workspace-client";
import { type ReactNode, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { WorkspaceContext } from "../../../v2-workspace/providers/WorkspaceProvider";

/**
 * Provides the workspace client + a synthetic workspace context for a freeform
 * session (no real workspace/worktree). Freeform sessions run on the local
 * host-service; the synthetic workspace lets the existing pane system (tabs,
 * terminals, chat) render unchanged, and `isFreeform` tells terminal/chat
 * consumers to omit the workspaceId so the host runs them in the home dir.
 */
export function FreeformSessionProvider({
	sessionId,
	children,
}: {
	sessionId: string;
	children: ReactNode;
}) {
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? "";

	const workspace = useMemo<SelectV2Workspace>(
		() => ({
			id: sessionId,
			organizationId,
			projectId: "",
			hostId: machineId ?? "",
			name: "Chat",
			branch: "",
			type: "worktree",
			createdByUserId: null,
			taskId: null,
			createdAt: new Date(0),
			updatedAt: new Date(0),
		}),
		[sessionId, organizationId, machineId],
	);

	const contextValue = useMemo(
		() => ({ workspace, hostUrl: activeHostUrl ?? "", isFreeform: true }),
		[workspace, activeHostUrl],
	);

	if (!activeHostUrl) {
		return <div className="flex h-full w-full" />;
	}

	return (
		<WorkspaceClientProvider
			cacheKey="freeform"
			key={`freeform:${activeHostUrl}`}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
			wsToken={() => getHostServiceWsToken(activeHostUrl)}
		>
			<WorkspaceContext.Provider value={contextValue}>
				{children}
			</WorkspaceContext.Provider>
		</WorkspaceClientProvider>
	);
}
