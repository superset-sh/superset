import { createEnv } from "@t3-oss/env-core";

export const env = createEnv({
	server: {},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
