import path from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

// Load .env from monorepo root
config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		DATABASE_URL_UNPOOLED: z.string().url(),
	},

	clientPrefix: "PUBLIC_",

	client: {},

	runtimeEnv: process.env,

	emptyStringAsUndefined: true,
	skipValidation: true,
});
