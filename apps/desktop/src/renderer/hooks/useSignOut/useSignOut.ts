import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

export const ACTIVE_ORG_ID_KEY = "active_organization_id";

// An unreachable auth server must not block local sign-out (#5729)
const SERVER_REVOKE_TIMEOUT_MS = 5_000;

export function useSignOut() {
	const signOutMutation = electronTrpc.auth.signOut.useMutation();
	const setAnalyticsUserId = electronTrpc.analytics.setUserId.useMutation();

	return async () => {
		posthog.reset();
		setAnalyticsUserId.mutate({ userId: null });
		localStorage.removeItem(ACTIVE_ORG_ID_KEY);
		await Promise.race([
			authClient.signOut({ fetchOptions: { throw: false } }).catch(() => {}),
			new Promise((resolve) =>
				window.setTimeout(resolve, SERVER_REVOKE_TIMEOUT_MS),
			),
		]);
		signOutMutation.mutate();
	};
}
