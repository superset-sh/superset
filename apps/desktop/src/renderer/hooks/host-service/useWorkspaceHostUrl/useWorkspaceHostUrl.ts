import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMemo } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
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
 * Resolves a workspace ID to its owning host-service target.
 *
 * The status union lets callers distinguish "still loading the collection"
 * from "local host hasn't booted yet" from "workspace doesn't exist on this
 * client" — three states the previous `string | null` API collapsed into one.
 */
export function useWorkspaceHostTarget(
	workspaceId: string | null,
): WorkspaceHostTarget {
	const { machineId, activeHostUrl } = useLocalHostService();
	const relayUrl = useRelayUrl();

	const { workspaces, isReady } = useHostWorkspaces();
	const match = workspaceId
		? (workspaces.find((w) => w.id === workspaceId) ?? null)
		: null;

	// A cloud workspace has no host row, so it never appears above. Its
	// address comes from the sandbox access provider, which wakes the open
	// workspace's sandbox and reports it once host-service answers.
	const {
		workspaces: cloudWorkspaces,
		organizationId,
		isFetched: cloudFetched,
	} = useCloudWorkspaces();
	const { targets: sandboxes } = useSandboxAccess();
	const cloudMatch = workspaceId
		? (cloudWorkspaces.find(
				(w) => w.id === workspaceId && w.status === "ready",
			) ?? null)
		: null;
	const sandbox = cloudMatch
		? (sandboxes.find(
				(target) => target.workspaceId === cloudMatch.id && target.running,
			) ?? null)
		: null;
	const cloudPending = Boolean(organizationId) && !match && !cloudFetched;

	return useMemo(() => {
		if (cloudMatch) {
			if (!sandbox) return { status: "loading" };
			return {
				status: "ready",
				kind: "sandbox",
				hostId: cloudMatch.id,
				url: sandbox.url,
			};
		}
		if (!workspaceId || (!isReady && !match)) return { status: "loading" };
		// The cloud list decides "not-found" as much as the host fan-out does;
		// answering before it lands flashes a not-found on every cloud open.
		if (!match && cloudPending) return { status: "loading" };
		if (!match) return { status: "not-found" };
		if (machineId && match.hostId === machineId) {
			if (activeHostUrl) {
				return {
					status: "ready",
					kind: "local",
					hostId: match.hostId,
					url: activeHostUrl,
				};
			}
			return { status: "local-starting", hostId: match.hostId };
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
		isReady,
		match,
		machineId,
		activeHostUrl,
		relayUrl,
		cloudMatch,
		sandbox,
		cloudPending,
	]);
}

/**
 * Backwards-compatible URL-only form for existing callers. Returns null
 * for any non-`ready` status (loading, local-starting, not-found).
 */
export function useWorkspaceHostUrl(workspaceId: string | null): string | null {
	const target = useWorkspaceHostTarget(workspaceId);
	return target.status === "ready" ? target.url : null;
}
