import { useEffect, useRef } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Starts the AgentManager on the main process when auth is ready.
 * Restarts when the active organization changes.
 */
export function useAgentManager() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const startMutation = electronTrpc.chatService.start.useMutation();
	const mutateRef = useRef(startMutation.mutateAsync);
	mutateRef.current = startMutation.mutateAsync;
	const prevStartKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId) return;
		const startKey = organizationId;
		if (startKey === prevStartKeyRef.current) return;

		void mutateRef
			.current({ organizationId })
			.then(() => {
				prevStartKeyRef.current = startKey;
			})
			.catch((error) => {
				console.error("[useAgentManager] Failed to start chat service:", error);
			});
	}, [organizationId]);
}
