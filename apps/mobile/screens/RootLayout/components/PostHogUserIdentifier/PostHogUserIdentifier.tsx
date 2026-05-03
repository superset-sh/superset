import { usePostHog } from "posthog-react-native";
import { useEffect } from "react";
import { useSession } from "@/lib/auth/client";

export function PostHogUserIdentifier() {
	const { data: session } = useSession();
	const posthog = usePostHog();
	const plan = session?.session?.plan ?? null;

	useEffect(() => {
		if (session?.user) {
			posthog.identify(session.user.id, {
				email: session.user.email,
				name: session.user.name,
				plan,
			});
		} else if (session === null) {
			posthog.reset();
		}
	}, [session, posthog, plan]);

	return null;
}
