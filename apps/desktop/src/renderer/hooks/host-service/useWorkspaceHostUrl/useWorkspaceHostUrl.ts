import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";

export type WorkspaceHostTarget =
	| { status: "loading" }
	| { status: "not-found" }
	| { status: "local-starting"; hostId: string }
	| {
			status: "ready";
			kind: "local" | "remote" | "sandbox";
			hostId: string;
			url: string;
	  };

/**
 * Resolves a workspace ID to its owning host-service target: a cloud
 * workspace's sandbox edge address once its sandbox is awake, this machine's
 * host-service, or another host through the relay.
 */
export function useWorkspaceHostTarget(
	workspaceId: string | null,
): WorkspaceHostTarget {
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();
	const { workspaces, isReady } = useHostWorkspaces();
	const { targets: sandboxes, isReady: sandboxesReady } = useSandboxAccess();

	const match = workspaces.find((w) => w.id === workspaceId) ?? null;
	const sandbox =
		sandboxes.find((target) => target.workspaceId === workspaceId) ?? null;

	return useMemo(() => {
		if (!workspaceId) return { status: "loading" };
		if (sandbox) {
			return sandbox.running
				? {
						status: "ready",
						kind: "sandbox",
						hostId: workspaceId,
						url: sandbox.url,
					}
				: { status: "loading" };
		}
		if (!match) {
			return isReady && sandboxesReady
				? { status: "not-found" }
				: { status: "loading" };
		}
		if (machineId && match.hostId === machineId) {
			return activeHostUrl
				? {
						status: "ready",
						kind: "local",
						hostId: match.hostId,
						url: activeHostUrl,
					}
				: { status: "local-starting", hostId: match.hostId };
		}
		const routingKey = buildHostRoutingKey(match.organizationId, match.hostId);
		return {
			status: "ready",
			kind: "remote",
			hostId: match.hostId,
			url: `${relayUrl}/hosts/${routingKey}`,
		};
	}, [
		workspaceId,
		sandbox,
		match,
		isReady,
		sandboxesReady,
		machineId,
		activeHostUrl,
		relayUrl,
	]);
}

/** URL-only form: null for any non-`ready` status. */
export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const target = useWorkspaceHostTarget(workspaceId);
	return target.status === "ready" ? target.url : null;
}
