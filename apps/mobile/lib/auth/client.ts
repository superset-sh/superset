import { expoClient } from "@better-auth/expo/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "../env";
import { transportFetch } from "../errors";
import { sessionStorage } from "./sessionStorage";

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
			storage: sessionStorage,
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
