import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

/**
 * Better Auth client for Electron desktop app.
 *
 * Security: Token stored in memory only (not localStorage).
 * - Better Auth reads token via getter function
 * - AuthProvider manages token in React context
 * - Token persisted only to encrypted disk storage (main process)
 */
export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	plugins: [organizationClient()],
	fetchOptions: {
		auth: {
			type: "Bearer",
			token: () => authToken || "",
		},
	},
});
