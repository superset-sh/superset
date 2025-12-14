import { type JWTPayload, jwtVerify } from "jose";
import type { AuthSession, AuthUser } from "shared/auth";

const DESKTOP_AUTH_SECRET = process.env.DESKTOP_AUTH_SECRET;

/**
 * Token payload received from web app
 */
interface DesktopAuthPayload extends JWTPayload {
	userId: string;
	name: string;
	email: string;
	avatarUrl: string | null;
}

/**
 * Result of handling an auth deep link
 */
export interface AuthDeepLinkResult {
	success: boolean;
	session?: AuthSession;
	error?: string;
}

/**
 * Handle authentication deep links from the web app
 * Validates and decodes the JWT token received via superset://auth/callback
 */
export async function handleAuthDeepLink(
	url: string,
): Promise<AuthDeepLinkResult> {
	try {
		const parsedUrl = new URL(url);

		// Check if this is an auth callback
		if (parsedUrl.host !== "auth" || parsedUrl.pathname !== "/callback") {
			return { success: false, error: "Not an auth callback URL" };
		}

		// Check for error response
		const error = parsedUrl.searchParams.get("error");
		if (error) {
			return { success: false, error };
		}

		// Get the token
		const token = parsedUrl.searchParams.get("token");
		if (!token) {
			return { success: false, error: "No token in callback" };
		}

		// Verify and decode the token
		const { payload, expiresAt } = await verifyToken(token);

		const user: AuthUser = {
			id: payload.userId,
			name: payload.name,
			email: payload.email,
			avatarUrl: payload.avatarUrl,
		};

		return {
			success: true,
			session: {
				token,
				user,
				expiresAt,
			},
		};
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Failed to process auth callback";
		console.error("[auth] Deep link handling failed:", message);
		return { success: false, error: message };
	}
}

async function verifyToken(
	token: string,
): Promise<{ payload: DesktopAuthPayload; expiresAt: number }> {
	if (!DESKTOP_AUTH_SECRET) {
		throw new Error("DESKTOP_AUTH_SECRET is not configured");
	}

	const secret = new TextEncoder().encode(DESKTOP_AUTH_SECRET);
	const { payload } = await jwtVerify(token, secret);

	// Validate required fields
	if (
		typeof payload.userId !== "string" ||
		typeof payload.name !== "string" ||
		typeof payload.email !== "string"
	) {
		throw new Error("Invalid token payload");
	}

	// Get expiration time
	const expiresAt = payload.exp
		? payload.exp * 1000
		: Date.now() + 7 * 24 * 60 * 60 * 1000;

	return {
		payload: payload as DesktopAuthPayload,
		expiresAt,
	};
}

/**
 * Check if a URL is an auth-related deep link
 */
export function isAuthDeepLink(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		// Accept both superset: and superset-dev: protocols
		const validProtocols = ["superset:", "superset-dev:"];
		return (
			validProtocols.includes(parsedUrl.protocol) && parsedUrl.host === "auth"
		);
	} catch {
		return false;
	}
}
