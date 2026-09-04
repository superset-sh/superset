import { SUPERSET_USER_ID_HEADER } from "@superset/shared/host-routing";
import { getJwt } from "./auth-client";

const secrets = new Map<string, string>();

let clientMachineId: string | null = null;
let clientUserId: string | null = null;

export function setClientMachineId(machineId: string): void {
	clientMachineId = machineId;
}

/**
 * The signed-in user, sent on every host-service call so the host can stamp
 * `createdByUserId` on what this client creates. A local host trusts it
 * because the caller holds its secret; the relay replaces it with the JWT
 * subject before a remote host ever sees it.
 */
export function setClientUserId(userId: string | null): void {
	clientUserId = userId;
}

export function setHostServiceSecret(hostUrl: string, secret: string): void {
	secrets.set(hostUrl, secret);
}

export function removeHostServiceSecret(hostUrl: string): void {
	secrets.delete(hostUrl);
}

/**
 * A sandbox has one gate, the provider's edge, and this is its key. Brokered
 * by `cloudWorkspace.access` and short-lived, so it is held per URL rather
 * than baked into the client. host-service inside a sandbox does not check a
 * secret of its own — see `EdgeGuardedHostAuthProvider`.
 */
const previewTokens = new Map<string, string>();

export function setSandboxCredentials(
	hostUrl: string,
	{ previewToken }: { previewToken: string },
): void {
	previewTokens.set(hostUrl, previewToken);
}

export function getHostServiceHeaders(hostUrl: string): Record<string, string> {
	const headers: Record<string, string> = clientMachineId
		? { "x-superset-client-machine-id": clientMachineId }
		: {};
	if (clientUserId) headers[SUPERSET_USER_ID_HEADER] = clientUserId;
	const previewToken = previewTokens.get(hostUrl);
	if (previewToken) headers["X-Blaxel-Preview-Token"] = previewToken;
	const secret = secrets.get(hostUrl);
	if (secret) {
		headers.Authorization = `Bearer ${secret}`;
		return headers;
	}
	// Relay: use JWT
	const jwt = getJwt();
	if (jwt) headers.Authorization = `Bearer ${jwt}`;
	return headers;
}

export function getHostServiceWsToken(hostUrl: string): string | null {
	// Local host-service: use PSK. Relay: fall back to user JWT.
	return secrets.get(hostUrl) ?? getJwt();
}

/**
 * The provider's edge reads its token from a header on HTTP requests, which a
 * WebSocket upgrade can't carry from a browser — there it reads this query
 * param instead.
 */
export function getHostServiceWsUrlParams(
	hostUrl: string,
): Record<string, string> | null {
	const previewToken = previewTokens.get(hostUrl);
	return previewToken ? { bl_preview_token: previewToken } : null;
}
