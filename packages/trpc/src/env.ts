import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		CLERK_SECRET_KEY: z.string().min(1),
		BLOB_READ_WRITE_TOKEN: z.string().min(1),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
