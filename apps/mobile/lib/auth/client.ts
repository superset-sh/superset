import { expoClient } from "@better-auth/expo/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	jwtClient,
	oneTimeTokenClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { env } from "../env";
import { transportFetch } from "../errors";

let jwt: string | null = null;

export function setJwt(token: string | null) {
	jwt = token;
}

export function getJwt(): string | null {
	return jwt;
}

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_API_URL,
	plugins: [
		expoClient({
			scheme: "superset",
			storagePrefix: "superset",
			storage: SecureStore,
		}),
		organizationClient({
			teams: { enabled: true },
			schema: {
				team: {
					additionalFields: {
						slug: { type: "string", input: true, required: true },
					},
				},
			},
		}),
		customSessionClient<typeof auth>(),
		jwtClient(),
		// Dev/e2e-only, mirroring the server plugin (packages/auth/src/server.ts) —
		// only a cloud sandbox or an e2e build ever has a token to redeem with it.
		...(__DEV__ || env.EXPO_PUBLIC_E2E === "1" ? [oneTimeTokenClient()] : []),
	],
	fetchOptions: {
		// So a dropped connection during sign-in is classifiable rather than
		// an opaque Expo exception string on the screen.
		customFetchImpl: transportFetch,
		onResponse: (context) => {
			const token = context.response.headers.get("set-auth-jwt");
			if (token) {
				setJwt(token);
			}
		},
	},
});

export const { signIn, signOut, signUp, useSession } = authClient;
