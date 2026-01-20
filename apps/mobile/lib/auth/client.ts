import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

// Get API URL from env
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";

export const authClient = createAuthClient({
	baseURL: API_URL,
	plugins: [
		expoClient({
			scheme: "superset",
			storagePrefix: "superset",
			storage: SecureStore,
		}),
	],
});

export const { signIn, signOut, signUp, useSession } = authClient;
