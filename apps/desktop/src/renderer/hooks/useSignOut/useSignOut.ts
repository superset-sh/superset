import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

export const AUTH_COMPLETED_KEY = "superset_auth_completed";
export const ACTIVE_ORG_ID_KEY = "active_organization_id";

export function useSignOut() {
	const signOutMutation = electronTrpc.auth.signOut.useMutation();
	const setAnalyticsUserId = electronTrpc.analytics.setUserId.useMutation();

	return async () => {
		posthog.reset();
		setAnalyticsUserId.mutate({ userId: null });
		localStorage.removeItem(AUTH_COMPLETED_KEY);
		localStorage.removeItem(ACTIVE_ORG_ID_KEY);
		await authClient.signOut();
		signOutMutation.mutate();
	};
}
