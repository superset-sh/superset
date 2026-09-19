import type { AuthProvider } from "@superset/shared/constants";
import type { AuthMethod } from "renderer/lib/last-auth-method";

export type SignInAgainAction =
	| { type: "provider"; provider: AuthProvider }
	| { type: "dev" }
	| { type: "sign-in-page" };

/**
 * Signing in with another provider than last time can create a second, empty
 * account, so the prompt only skips the sign-in page when it knows the provider.
 */
export function resolveSignInAgainAction({
	lastMethod,
	isDevelopment,
}: {
	lastMethod: AuthMethod | null;
	isDevelopment: boolean;
}): SignInAgainAction {
	if (lastMethod === "github" || lastMethod === "google") {
		return { type: "provider", provider: lastMethod };
	}
	if (lastMethod === "dev" && isDevelopment) return { type: "dev" };
	return { type: "sign-in-page" };
}
