import {
	ensureFreshJwt,
	getJwt,
	isJwtExpiringSoon,
	refreshJwt,
} from "./auth-client";

const secrets = new Map<string, string>();

let clientMachineId: string | null = null;

export function setClientMachineId(machineId: string): void {
	clientMachineId = machineId;
}

export function setHostServiceSecret(hostUrl: string, secret: string): void {
	secrets.set(hostUrl, secret);
}

export function removeHostServiceSecret(hostUrl: string): void {
	secrets.delete(hostUrl);
}

export function getHostServiceHeaders(hostUrl: string): Record<string, string> {
	const headers: Record<string, string> = clientMachineId
		? { "x-superset-client-machine-id": clientMachineId }
		: {};
	const secret = secrets.get(hostUrl);
	if (secret) {
		headers.Authorization = `Bearer ${secret}`;
		return headers;
	}
	// Relay: use JWT
	const jwt = getJwt();
	if (jwt && isJwtExpiringSoon()) {
		void refreshJwt();
	}
	if (jwt) headers.Authorization = `Bearer ${jwt}`;
	return headers;
}

export async function getHostServiceHeadersAsync(
	hostUrl: string,
): Promise<Record<string, string>> {
	const headers: Record<string, string> = clientMachineId
		? { "x-superset-client-machine-id": clientMachineId }
		: {};
	const secret = secrets.get(hostUrl);
	if (secret) {
		headers.Authorization = `Bearer ${secret}`;
		return headers;
	}
	const jwt = await ensureFreshJwt();
	if (jwt) headers.Authorization = `Bearer ${jwt}`;
	return headers;
}

export function getHostServiceWsToken(hostUrl: string): string | null {
	// Local host-service: use PSK. Relay: fall back to user JWT.
	const secret = secrets.get(hostUrl);
	if (secret) return secret;
	const jwt = getJwt();
	if (jwt && isJwtExpiringSoon()) {
		void refreshJwt();
	}
	return jwt;
}
