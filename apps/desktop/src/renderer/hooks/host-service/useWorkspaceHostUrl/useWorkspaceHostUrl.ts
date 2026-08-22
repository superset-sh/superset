import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { setSandboxCredentials } from "renderer/lib/host-service-auth";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const ACCESS_RETRY_MS = 15_000;

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
	// address and the two credentials it needs are brokered per access,
	// because the provider token expires.
	const organizationId = useActiveOrganizationId();
	const cloudQuery = cloudTrpc.cloudWorkspace.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId && !match },
	);
	const cloudWorkspaces = cloudQuery.data ?? [];
	const cloudPending =
		Boolean(organizationId) && !match && !cloudQuery.isFetched;
	// Only a `ready` row has an address to broker: the list carries workspaces
	// that are still provisioning, and `access` refuses those.
	const cloudMatch = workspaceId
		? (cloudWorkspaces.find(
				(w) => w.id === workspaceId && w.status === "ready",
			) ?? null)
		: null;
	const access = cloudTrpc.cloudWorkspace.access.useMutation();
	const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
	// The mutation object is a new identity on every render; the effect below
	// must key on the workspace alone or it re-mints on each one.
	const requestAccess = useRef(access.mutateAsync);
	requestAccess.current = access.mutateAsync;
	const cloudWorkspaceId = cloudMatch?.id ?? null;

	useEffect(() => {
		if (!cloudWorkspaceId) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const grant = async () => {
			try {
				const granted = await requestAccess.current({ id: cloudWorkspaceId });
				if (cancelled) return;
				setSandboxCredentials(granted.url, {
					previewToken: granted.token,
				});
				setSandboxUrl(granted.url);
				// The provider's token outlives neither an open workspace nor its
				// socket, so re-mint ahead of expiry rather than on failure.
				const remaining = new Date(granted.expiresAt).getTime() - Date.now();
				timer = setTimeout(grant, Math.max(30_000, remaining * 0.8));
			} catch {
				if (!cancelled) timer = setTimeout(grant, ACCESS_RETRY_MS);
			}
		};
		void grant();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [cloudWorkspaceId]);

	return useMemo(() => {
		if (cloudMatch) {
			if (!sandboxUrl) return { status: "loading" };
			return {
				status: "ready",
				kind: "sandbox",
				hostId: cloudMatch.id,
				url: sandboxUrl,
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
		cloudPending,
		sandboxUrl,
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
