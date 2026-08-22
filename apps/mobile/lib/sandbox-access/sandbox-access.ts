import { apiClient } from "@/lib/trpc/client";

/**
 * A sandbox has no stable address: the cloud brokers a preview URL plus a
 * short-lived provider token per access, and the token — not anything
 * host-service checks — is the whole of the sandbox's access control. This
 * holds the latest grant per cloud workspace so the HTTP client can attach the
 * token by URL and the terminal can sign each dial with a fresh one.
 */
export interface SandboxAccess {
	url: string;
	token: string;
	expiresAt: number;
}

/**
 * Re-mint this close to expiry rather than at it: a token that dies mid-dial
 * costs a reconnect, and iOS may have frozen the timer that would have
 * refreshed it.
 */
const STALE_BEFORE_MS = 60_000;

const accessByWorkspaceId = new Map<string, SandboxAccess>();
const previewTokenByUrl = new Map<string, string>();
const inflight = new Map<string, Promise<SandboxAccess>>();
/**
 * Bumped whenever a workspace's grants are retired, so a mint that was
 * already in flight when the retirement happened cannot land afterwards and
 * quietly resurrect credentials for a workspace this client gave up.
 */
const epochByWorkspaceId = new Map<string, number>();

export function getSandboxAccess(workspaceId: string): SandboxAccess | null {
	return accessByWorkspaceId.get(workspaceId) ?? null;
}

/** True when this host id is a cloud workspace whose sandbox has an address. */
export function isSandboxHost(machineId: string): boolean {
	return accessByWorkspaceId.has(machineId);
}

export function sandboxPreviewToken(hostUrl: string): string | null {
	return previewTokenByUrl.get(hostUrl) ?? null;
}

function isFresh(access: SandboxAccess): boolean {
	return access.expiresAt - Date.now() > STALE_BEFORE_MS;
}

/**
 * The current grant, minting a new one when there is none or it is about to
 * expire. Concurrent callers share one mint.
 */
export function ensureSandboxAccess(
	workspaceId: string,
): Promise<SandboxAccess> {
	const cached = accessByWorkspaceId.get(workspaceId);
	if (cached && isFresh(cached)) return Promise.resolve(cached);
	const pending = inflight.get(workspaceId);
	if (pending) return pending;

	const epoch = epochByWorkspaceId.get(workspaceId) ?? 0;
	const mint = apiClient.cloudWorkspace.access
		.mutate({ id: workspaceId })
		.then((granted) => {
			const access: SandboxAccess = {
				url: granted.url,
				token: granted.token,
				expiresAt: new Date(granted.expiresAt).getTime(),
			};
			if ((epochByWorkspaceId.get(workspaceId) ?? 0) !== epoch) {
				// Retired mid-mint; hand the grant to the caller (its request is
				// legitimate) but don't re-register credentials nothing owns.
				return access;
			}
			// A renewed preview can move URLs; the old address must stop
			// resolving a token or a cached client keeps authenticating with it.
			const previous = accessByWorkspaceId.get(workspaceId);
			if (previous && previous.url !== access.url) {
				previewTokenByUrl.delete(previous.url);
			}
			accessByWorkspaceId.set(workspaceId, access);
			previewTokenByUrl.set(access.url, access.token);
			return access;
		})
		.finally(() => {
			inflight.delete(workspaceId);
		});
	inflight.set(workspaceId, mint);
	return mint;
}

/** Forget a workspace that is gone; its URL stops carrying a token. */
export function clearSandboxAccess(workspaceId: string): void {
	epochByWorkspaceId.set(
		workspaceId,
		(epochByWorkspaceId.get(workspaceId) ?? 0) + 1,
	);
	const access = accessByWorkspaceId.get(workspaceId);
	if (access) previewTokenByUrl.delete(access.url);
	accessByWorkspaceId.delete(workspaceId);
}

/**
 * Drop every grant the current cloud list no longer vouches for. The registry
 * is module state, so nothing unmounts it — without this, signing out,
 * switching organizations, or a workspace deleted elsewhere would leave a
 * stale grant resolving its id to a sandbox URL forever. The list is the
 * source of truth for which sandboxes exist, so it is also the thing that
 * retires their credentials.
 */
export function pruneSandboxAccess(keepIds: ReadonlySet<string>): void {
	for (const workspaceId of accessByWorkspaceId.keys()) {
		if (!keepIds.has(workspaceId)) clearSandboxAccess(workspaceId);
	}
}
