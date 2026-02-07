import { useEffect } from "react";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "../../lib/posthog";

const AUTH_COMPLETED_KEY = "superset_auth_completed";

export function PostHogUserIdentifier() {
	const { data: session } = authClient.useSession();
	const user = session?.user;
	const { mutate: setUserId } = electronTrpc.analytics.setUserId.useMutation();

	useEffect(() => {
		if (user) {
			posthog.identify(user.id, {
				email: user.email,
				name: user.name,
				desktop_version: window.App.appVersion,
			});
			posthog.reloadFeatureFlags();
			setUserId({ userId: user.id });

			const trackedUserId = localStorage.getItem(AUTH_COMPLETED_KEY);
			if (trackedUserId !== user.id) {
				track("auth_completed");
				localStorage.setItem(AUTH_COMPLETED_KEY, user.id);
			}
		} else if (session !== undefined && !user) {
			// Session loaded but no user - user is signed out
			posthog.reset();
			setUserId({ userId: null });
			localStorage.removeItem(AUTH_COMPLETED_KEY);
		}
	}, [user, session, setUserId]);

	return null;
}
