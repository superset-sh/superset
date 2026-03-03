import { Outlit } from "@outlit/node";
import { env } from "main/env.main";

export const outlit = new Outlit({
	publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
});
