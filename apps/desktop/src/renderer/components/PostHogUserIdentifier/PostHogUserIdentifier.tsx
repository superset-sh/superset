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
		const createdAt = user.createdAt
			? new Date(user.createdAt).toISOString()
			: undefined;
		posthog.identify(user.id, {
			email: user.email,
			name: user.name,
			desktop_version: window.App.appVersion,
			...(createdAt ? { created_at: createdAt } : {}),
		});
		if (createdAt) {
			// Included in flag evaluation requests so release conditions can
			// target account age immediately, without waiting for ingestion.
			// `false` skips the built-in reload; reloadFeatureFlags below covers it.
			posthog.setPersonPropertiesForFlags({ created_at: createdAt }, false);
		}
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
