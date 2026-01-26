"use client";

import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_API_URL,
	plugins: [
		organizationClient(),
		customSessionClient<typeof auth>(),
		stripeClient({ subscription: true }),
	],
});
