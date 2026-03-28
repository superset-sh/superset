const secrets = new Map<string, string>();

export function setHostServiceSecret(hostUrl: string, secret: string): void {
	secrets.set(hostUrl, secret);
}

export function removeHostServiceSecret(hostUrl: string): void {
	secrets.delete(hostUrl);
}

export function getHostServiceHeaders(hostUrl: string): Record<string, string> {
	const secret = secrets.get(hostUrl);
	return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export function getHostServiceWsToken(hostUrl: string): string | null {
	return secrets.get(hostUrl) ?? null;
}
