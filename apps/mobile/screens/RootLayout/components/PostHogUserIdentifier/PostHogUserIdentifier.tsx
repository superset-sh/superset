import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";

export function PostHogUserIdentifier() {
	const { data: session } = useSession();
	const posthog = usePostHog();

	useEffect(() => {
		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
			});
		} else if (session === null) {
			posthog.reset();
		}
	}, [session, posthog]);

	return null;
}
