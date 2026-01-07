"use client";

import { createAuthClient as createBetterAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// React client for browser usage
export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL,
	plugins: [organizationClient()],
});

// Factory for creating a vanilla JS client for non-React environments (e.g., Electron main process)
// This doesn't require a database connection - it's just an API client
export function createAuthApiClient(baseURL: string) {
	return createBetterAuthClient({
		baseURL,
		plugins: [organizationClient()],
	});
}

// Default instance for environments where NEXT_PUBLIC_API_URL is available
export const authApiClient =
	typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
		? createAuthApiClient(process.env.NEXT_PUBLIC_API_URL)
		: null;
