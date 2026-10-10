import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		NEXT_PUBLIC_MARKETING_URL: z.string(),
		EMAIL_SENDING_DOMAIN: z.string().default("superset.sh"),
	},

	clientPrefix: "PUBLIC_",

	client: {},

	runtimeEnv: {
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
		EMAIL_SENDING_DOMAIN: process.env.EMAIL_SENDING_DOMAIN,
	},

	emptyStringAsUndefined: true,
});
