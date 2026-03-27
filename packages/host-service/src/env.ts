import { randomBytes } from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
	HOST_SERVICE_SECRET: z
		.string()
		.min(1)
		.default(randomBytes(32).toString("hex")),
	HOST_DB_PATH: z.string().min(1).optional(),
	CORS_ORIGINS: z
		.string()
		.transform((s) => s.split(",").map((o) => o.trim()))
		.optional(),
	PORT: z.coerce.number().int().positive().default(4879),
});

export const env = envSchema.parse(process.env);
