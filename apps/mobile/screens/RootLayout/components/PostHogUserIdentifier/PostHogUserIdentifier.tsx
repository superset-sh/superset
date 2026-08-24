import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/client";
import { posthog, registerSuperProperties } from "@/lib/posthog";

export function PostHogUserIdentifier() {
	const { data: session } = useSession();
	/** Who PostHog currently thinks this is, so neither call repeats itself. */
	const identifiedUserId = useRef<string | null>(null);

	useEffect(() => {
		const user = session?.user;
		if (user) {
			if (identifiedUserId.current === user.id) return;
			identifiedUserId.current = user.id;
			posthog.identify(user.id, { email: user.email, name: user.name });
			return;
		}
		// Only an actual sign-OUT resets. Resetting whenever there is merely no
		// session meant every signed-out launch minted a fresh anonymous id, and
		// `reset()` drops the registered properties with it — which is why events
		// after the first one in a signed-out launch arrived with no `app_name`.
		if (session === null && identifiedUserId.current !== null) {
			identifiedUserId.current = null;
			posthog.reset();
			registerSuperProperties();
		}
	}, [session]);

	return null;
}
