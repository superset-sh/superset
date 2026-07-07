import { WorkspaceClientProvider } from "@superset/workspace-client";
import type { ReactNode } from "react";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Host-service client context for freeform (non-workspace) chats. Unlike a
 * workspace, a freeform chat isn't pinned to a host row, so it runs on the
 * local host-service, which resolves its cwd to the machine's home dir.
 */
export function FreeformChatProvider({ children }: { children: ReactNode }) {
	const { activeHostUrl } = useLocalHostService();

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
			{children}
		</WorkspaceClientProvider>
	);
}
