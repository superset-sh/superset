import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { getBaseUrl } from "../base-url";

const BASE_URL = getBaseUrl();

export const authClient = createAuthClient({
	baseURL: BASE_URL,
	plugins: [
		expoClient({
			scheme: "superset",
			storagePrefix: "superset",
			storage: SecureStore,
		}),
	],
});

export const { signIn, signOut, signUp, useSession } = authClient;
