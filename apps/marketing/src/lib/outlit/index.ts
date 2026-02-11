import { Outlit } from "@outlit/browser";

import { env } from "@/env";

let outlit: Outlit | null = null;

export function getOutlit(): Outlit | null {
	if (!env.NEXT_PUBLIC_OUTLIT_KEY) return null;

	if (!outlit) {
		outlit = new Outlit({
			publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
			trackPageviews: true,
			trackForms: true,
			autoTrack: false,
		});
	}
	return outlit;
}
