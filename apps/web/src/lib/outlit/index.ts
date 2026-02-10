import { Outlit } from "@outlit/browser";

import { env } from "@/env";

let instance: Outlit | undefined;

export function getOutlit(): Outlit {
	if (!instance) {
		instance = new Outlit({
			publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
			trackPageviews: true,
		});
	}
	return instance;
}
