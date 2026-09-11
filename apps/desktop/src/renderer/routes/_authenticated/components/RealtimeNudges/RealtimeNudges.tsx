import {
	parseRealtimeNudgeMessage,
	REALTIME_NUDGE_KINDS,
	type RealtimeNudgeKind,
	realtimeNudgesPath,
} from "@superset/shared/realtime";
import { createRelaySocket } from "@superset/workspace-client";
import { useEffect } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { getJwt } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * One socket per window to the realtime Worker. The API sends a nudge after
 * it writes hosts, pull requests or cloud workspaces, and this refetches the
 * matching queries, which is why none of them poll. A reopen refetches
 * everything once, since nudges sent while the socket was down are gone.
 * Rendered inside the providers: the subscription needs the active
 * organization.
 */
export function RealtimeNudges() {
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();

	useEffect(() => {
		if (!organizationId) return;
		const invalidate = (kinds: readonly RealtimeNudgeKind[]) => {
			for (const kind of kinds) {
				switch (kind) {
					case "hosts":
						void utils.v2Host.list.invalidate();
						break;
					case "pull_requests":
						void utils.integration.github.getByBranches.invalidate();
						break;
					case "cloud_workspaces":
						void utils.cloudWorkspace.list.invalidate();
						break;
				}
			}
		};
		const socket = createRelaySocket({
			buildUrl: () =>
				`${env.REALTIME_URL}${realtimeNudgesPath(organizationId)}`,
			getToken: () => getJwt(),
			minReconnectionDelay: 1_000,
			maxReconnectionDelay: 30_000,
		});
		// The first open follows the queries' own initial fetch; only a reopen
		// can have missed something.
		let opened = false;
		socket.addEventListener("open", () => {
			if (opened) invalidate(REALTIME_NUDGE_KINDS);
			opened = true;
		});
		socket.addEventListener("message", (event) => {
			const message = parseRealtimeNudgeMessage(event.data);
			if (message) invalidate(message.kinds);
		});
		return () => socket.close(1000, "unsubscribed");
	}, [organizationId, utils]);

	return null;
}
