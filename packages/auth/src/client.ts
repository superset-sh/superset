"use client";

import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Auth client for both browser and non-browser environments
// This doesn't require a database connection - it's just an API client
export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL,
	plugins: [organizationClient(), customSessionClient<typeof auth>()],
});
