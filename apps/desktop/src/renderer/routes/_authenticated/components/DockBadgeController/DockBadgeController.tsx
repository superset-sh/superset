import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useV2AttentionWorkspaceCount } from "renderer/stores/v2-notifications";

/**
 * Mirrors the combined unread + attention-needed workspace count onto the OS
 * dock/taskbar badge. Mounted once at the authenticated layout level, sibling
 * to `V2NotificationController` which keeps the underlying store up to date.
 *
 * The badge is cleared on unmount (e.g. sign-out) so a stale count never
 * lingers on the app icon.
 */
export function DockBadgeController() {
	const count = useV2AttentionWorkspaceCount();
	const setDockBadge = electronTrpc.notifications.setDockBadge.useMutation();

	const mutateRef = useRef(setDockBadge.mutate);
	mutateRef.current = setDockBadge.mutate;

	useEffect(() => {
		mutateRef.current({ count });
	}, [count]);

	useEffect(() => {
		return () => {
			mutateRef.current({ count: 0 });
		};
	}, []);

	return null;
}
