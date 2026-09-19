import type { AuthProvider } from "@superset/shared/constants";

const LAST_USED_METHOD_KEY = "superset-last-auth-method";

export type AuthMethod = AuthProvider | "dev";

export function readLastAuthMethod(): AuthMethod | null {
	const stored = window.localStorage.getItem(LAST_USED_METHOD_KEY);
	return stored === "github" || stored === "google" || stored === "dev"
		? stored
		: null;
}

export function writeLastAuthMethod(method: AuthMethod) {
	window.localStorage.setItem(LAST_USED_METHOD_KEY, method);
}
