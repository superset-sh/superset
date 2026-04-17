import type { ApiAuthProvider } from "../types";

const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const JWT_CACHE_DURATION_MS = 55 * 60 * 1000;

export class JwtApiAuthProvider implements ApiAuthProvider {
	private readonly sessionToken: string;
	private readonly apiUrl: string;
	private cachedJwt: string | null = null;
	private cachedJwtExpiresAt = 0;

	constructor(sessionToken: string, apiUrl: string) {
		this.sessionToken = sessionToken;
		this.apiUrl = apiUrl;
	}

	async getHeaders(): Promise<Record<string, string>> {
		const jwt = await this.getJwt();
		return { Authorization: `Bearer ${jwt}` };
	}

	async getJwt(): Promise<string> {
		if (
			this.cachedJwt &&
			Date.now() < this.cachedJwtExpiresAt - JWT_REFRESH_BUFFER_MS
		) {
			return this.cachedJwt;
		}

		const response = await fetch(`${this.apiUrl}/api/auth/token`, {
			headers: { Authorization: `Bearer ${this.sessionToken}` },
		});
		if (!response.ok) {
			throw new Error(`Failed to mint JWT: ${response.status}`);
		}
		const data = (await response.json()) as { token: string };
		this.cachedJwt = data.token;
		this.cachedJwtExpiresAt = Date.now() + JWT_CACHE_DURATION_MS;
		return data.token;
	}
}
