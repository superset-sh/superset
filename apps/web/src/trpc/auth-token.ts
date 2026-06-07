import { env } from "../env";

// Better Auth user JWT for relay-fronted host-service calls. Cached and
// reused until close to its 1h expiry; the relay verifies it via JWKS.
interface CachedToken {
	token: string;
	fetchedAt: number;
}

let cached: CachedToken | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

export async function getAuthToken(): Promise<string> {
	if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) {
		return cached.token;
	}
	const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/auth/token`, {
		credentials: "include",
	});
	if (!response.ok) {
		throw new Error(`Auth token request failed (${response.status})`);
	}
	const body = (await response.json()) as { token?: string };
	if (!body.token) throw new Error("Auth token response missing token");
	cached = { token: body.token, fetchedAt: Date.now() };
	return body.token;
}
