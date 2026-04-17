import { getJwt } from "./auth-client";

const secrets = new Map<string, string>();

export function setHostServiceSecret(hostUrl: string, secret: string): void {
	secrets.set(hostUrl, secret);
}

export function removeHostServiceSecret(hostUrl: string): void {
	secrets.delete(hostUrl);
}

export function getHostServiceHeaders(hostUrl: string): Record<string, string> {
	const secret = secrets.get(hostUrl);
	if (secret) return { Authorization: `Bearer ${secret}` };
	// Relay: use JWT
	const jwt = getJwt();
	return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

export function getHostServiceWsToken(hostUrl: string): string | null {
	// Local host-service: use PSK. Relay: fall back to user JWT.
	return secrets.get(hostUrl) ?? getJwt();
}
