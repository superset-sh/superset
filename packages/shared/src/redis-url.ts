import { z } from "zod";

export const redisUrl = z
	.string()
	.url()
	.refine(
		(value) =>
			URL.canParse(value) &&
			["redis:", "rediss:"].includes(new URL(value).protocol),
		"Redis URL must use redis:// or rediss://",
	);
