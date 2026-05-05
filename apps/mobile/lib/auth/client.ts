import { expoClient } from "@better-auth/expo/client";
import type { auth } from "@superset/auth/server";
import {
	customSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { env } from "../env";

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_API_URL,
	plugins: [
		expoClient({
			scheme: "superset",
			storagePrefix: "superset",
			storage: SecureStore,
		}),
		organizationClient(),
		customSessionClient<typeof auth>(),
	],
});

export const { signIn, signOut, signUp, useSession } = authClient;
