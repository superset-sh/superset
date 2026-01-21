import { expoClient } from "@better-auth/expo/client";
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
	],
});

export const { signIn, signOut, signUp, useSession } = authClient;
