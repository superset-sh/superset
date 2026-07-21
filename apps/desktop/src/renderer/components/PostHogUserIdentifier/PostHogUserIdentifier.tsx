import { useEffect } from "react";
import { ACTIVE_ORG_ID_KEY } from "renderer/hooks/useSignOut";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "../../lib/posthog";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const user = session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const { mutate: setUserId } = electronTrpc.analytics.setUserId.useMutation();

	useEffect(() => {
		if (!user) return;
		posthog.identify(user.id, {
			email: user.email,
			name: user.name,
			desktop_version: window.App.appVersion,
		});
		posthog.reloadFeatureFlags();
		setUserId({ userId: user.id });
	}, [user, setUserId]);

	useEffect(() => {
		if (session === undefined) return;

		if (activeOrganizationId) {
			localStorage.setItem(ACTIVE_ORG_ID_KEY, activeOrganizationId);
		} else {
			localStorage.removeItem(ACTIVE_ORG_ID_KEY);
		}
	}, [session, activeOrganizationId]);

	return null;
}
