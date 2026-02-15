import { Outlit } from "@outlit/browser";
import { env } from "renderer/env.renderer";

export const outlit = new Outlit({
	publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
	trackPageviews: false,
	autoTrack: false,
});
