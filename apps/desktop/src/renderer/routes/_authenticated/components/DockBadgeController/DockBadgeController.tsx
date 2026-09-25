import { useEffect } from "react";
import { useAttentionWorkspaceCount } from "renderer/hooks/host-service/useNotificationStatus";
import { electronTrpcClient } from "renderer/lib/trpc-client";

/**
 * Mirrors the unread + attention-needed workspace count onto the OS
 * dock/taskbar badge. Cleared on unmount (e.g. sign-out) so a stale count
 * never lingers on the app icon.
 */
export function DockBadgeController() {
	const count = useAttentionWorkspaceCount();

	useEffect(() => {
		void electronTrpcClient.notifications.setDockBadge.mutate({ count });
	}, [count]);

	useEffect(() => {
		return () => {
			void electronTrpcClient.notifications.setDockBadge.mutate({ count: 0 });
		};
	}, []);

	return null;
}
