import { Outlit } from "@outlit/browser";
import { env } from "renderer/env.renderer";

let outlit: Outlit | null = null;

export function getOutlit(): Outlit | null {
	if (!env.NEXT_PUBLIC_OUTLIT_KEY) return null;

	if (!outlit) {
		outlit = new Outlit({
			publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
			trackPageviews: false,
			autoTrack: true,
		});
	}
	return outlit;
}
