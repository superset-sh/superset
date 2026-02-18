import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	apiKeyClient,
	customSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";
import {
	MOCK_ORG_ID,
	MOCK_USER_EMAIL,
	MOCK_USER_ID,
	MOCK_USER_NAME,
} from "shared/constants";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

function createMockFetch() {
	const mockSession = {
		session: {
			id: "mock-session-id",
			userId: MOCK_USER_ID,
			token: "mock-token",
			expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
			activeOrganizationId: MOCK_ORG_ID,
			organizationIds: [MOCK_ORG_ID],
			plan: "pro",
		},
		user: {
			id: MOCK_USER_ID,
			email: MOCK_USER_EMAIL,
			name: MOCK_USER_NAME,
			image: null,
			emailVerified: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	};

	return async () =>
		new Response(JSON.stringify(mockSession), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
}

/**
 * Better Auth client for Electron desktop app.
 *
 * Bearer authentication configured via onRequest hook.
 * Server has bearer() plugin enabled to accept bearer tokens.
 */
export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	plugins: [
		organizationClient(),
		customSessionClient<typeof auth>(),
		stripeClient({ subscription: true }),
		apiKeyClient(),
	],
	fetchOptions: {
		credentials: "include",
		...(env.SKIP_ENV_VALIDATION ? { customFetchImpl: createMockFetch() } : {}),
		onRequest: async (context) => {
			const token = getAuthToken();
			if (token) {
				context.headers.set("Authorization", `Bearer ${token}`);
			}
		},
	},
});
