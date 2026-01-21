import Constants from "expo-constants";

import { env } from "./env";

/**
 * Get the base API URL for the mobile app.
 *
 * In development:
 * - If EXPO_PUBLIC_API_URL contains localhost/127.0.0.1, automatically replaces it
 *   with the dev server's IP address from Expo Constants
 * - Falls back to EXPO_PUBLIC_API_URL if no dev server IP is available
 *
 * In production:
 * - Uses EXPO_PUBLIC_API_URL as-is
 * - Throws an error if it contains localhost (React Native can't use localhost)
 */
export function getBaseUrl(): string {
	const apiUrl = env.EXPO_PUBLIC_API_URL;
	const isDev = env.NODE_ENV === "development";

	const isLocalhost =
		apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1");

	if (!isDev && isLocalhost) {
		throw new Error(
			"EXPO_PUBLIC_API_URL cannot use localhost or 127.0.0.1 in production. Use your production API URL instead.",
		);
	}

	if (isDev && isLocalhost) {
		const devServerIp = Constants.expoConfig?.hostUri?.split(":")[0];

		if (devServerIp) {
			const urlObj = new URL(apiUrl);
			const replacedUrl = apiUrl.replace(urlObj.hostname, devServerIp);
			console.log(
				`[base-url] Auto-detected dev server IP: ${devServerIp}, using ${replacedUrl}`,
			);
			return replacedUrl;
		}

		console.warn(
			"[base-url] Could not auto-detect dev server IP, using localhost URL as-is. This may not work on physical devices.",
		);
	}

	return apiUrl;
}
