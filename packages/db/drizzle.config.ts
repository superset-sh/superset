import type { Config } from "drizzle-kit";

import { env } from "./src/env";

export default {
	schema: "./src/schema/index.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: { url: env.DATABASE_URL_UNPOOLED },
	casing: "snake_case",
} satisfies Config;
