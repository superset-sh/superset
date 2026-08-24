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
		// `session === null` is the steady state of a signed-out app, not an
		// event: resetting on it minted a fresh anonymous id every launch, and
		// `reset()` drops the registered properties along with the id.
		if (session === null && identifiedUserId.current !== null) {
			identifiedUserId.current = null;
			posthog.reset();
			registerSuperProperties();
		}
	}, [session]);

	return null;
}
