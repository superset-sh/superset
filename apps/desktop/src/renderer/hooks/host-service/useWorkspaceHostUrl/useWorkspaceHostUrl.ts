import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { setHostServiceSecret } from "renderer/lib/host-service-auth";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const ACCESS_RETRY_MS = 15_000;
/**
 * A woken sandbox answers a few seconds after the grant: the session boots
 * from the filesystem snapshot and host-service is started fresh. Publishing
 * the address before it listens sends every pane into a failed reconnect that
 * is only retried on the next token refresh, minutes later — so the address
 * is held back until the host answers, for at most this long.
 */
const HOST_READY_TIMEOUT_MS = 45_000;
const HOST_READY_POLL_MS = 1_000;
const HOST_READY_REQUEST_TIMEOUT_MS = 5_000;

/**
 * One poll per host, however many callers are waiting: this hook has a
 * consumer per pane and provider, and a loop each would hit the booting
 * sandbox dozens of times a second.
 */
const hostReadyWaits = new Map<string, Promise<void>>();

function waitForHost(url: string, token: string): Promise<void> {
	const pending = hostReadyWaits.get(url);
	if (pending) return pending;
	const wait = (async () => {
		const deadline = Date.now() + HOST_READY_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const ok = await fetch(`${url}/trpc/health.check`, {
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(HOST_READY_REQUEST_TIMEOUT_MS),
			})
				.then((response) => response.ok)
				.catch(() => false);
			if (ok) return;
			await new Promise((resolve) => setTimeout(resolve, HOST_READY_POLL_MS));
		}
	})().finally(() => hostReadyWaits.delete(url));
	hostReadyWaits.set(url, wait);
	return wait;
}

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
	const queryClient = useQueryClient();
	// Keyed by workspace: a switch leaves the previous grant in state until the
	// new one lands, and an unkeyed URL would report the new workspace ready
	// at the old workspace's sandbox.
	const [grant, setGrant] = useState<{
		workspaceId: string;
		url: string;
	} | null>(null);
	// The mutation object is a new identity on every render; the effect below
	// must key on the workspace alone or it re-mints on each one.
	const requestAccess = useRef(access.mutateAsync);
	requestAccess.current = access.mutateAsync;
	const cloudWorkspaceId = cloudMatch?.id ?? null;

	useEffect(() => {
		if (!cloudWorkspaceId) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const requestGrant = async () => {
			try {
				// This is the open workspace, so the mint wakes the sandbox: a
				// stopped session resumes, a running one is kept from its idle
				// stop. The sidebar's mints for every other workspace never wake.
				const granted = await requestAccess.current({
					id: cloudWorkspaceId,
					wake: true,
				});
				if (cancelled) return;
				setHostServiceSecret(granted.url, granted.token);
				await waitForHost(granted.url, granted.token);
				if (cancelled) return;
				setGrant({ workspaceId: cloudWorkspaceId, url: granted.url });
				// The sidebar addressed this sandbox as stopped and left it out of
				// the host fan-out; now that it answers, let it re-address.
				if (!granted.running) {
					void queryClient.invalidateQueries({
						queryKey: ["cloud-workspace", "access", cloudWorkspaceId],
					});
				}
				// The token outlives neither an open workspace nor its socket, so
				// re-mint ahead of expiry rather than on failure.
				const remaining = new Date(granted.expiresAt).getTime() - Date.now();
				timer = setTimeout(requestGrant, Math.max(30_000, remaining * 0.8));
			} catch {
				if (!cancelled) timer = setTimeout(requestGrant, ACCESS_RETRY_MS);
			}
		};
		void requestGrant();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [cloudWorkspaceId, queryClient]);

	return useMemo(() => {
		if (cloudMatch) {
			if (grant?.workspaceId !== cloudMatch.id) return { status: "loading" };
			return {
				status: "ready",
				kind: "sandbox",
				hostId: cloudMatch.id,
				url: grant.url,
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
		grant,
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
