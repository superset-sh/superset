import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		NEXT_PUBLIC_MARKETING_URL: z.string(),
	},

	clientPrefix: "PUBLIC_",

	client: {},

	runtimeEnv: {
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
	},

	emptyStringAsUndefined: true,
});
