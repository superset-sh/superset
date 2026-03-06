import { Outlit } from "@outlit/browser";

import { env } from "@/env";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

let instance: Outlit | undefined;

export function getOutlit(): Outlit | undefined {
	if (typeof window === "undefined") return undefined;

	if (!instance) {
		instance = new Outlit({
			publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
			trackPageviews: true,
			trackForms: true,
		});

		// Respect prior consent choice — disable tracking if user previously opted out
		if (localStorage.getItem(ANALYTICS_CONSENT_KEY) === "declined") {
			instance.disableTracking();
		}
	}
	return instance;
}
