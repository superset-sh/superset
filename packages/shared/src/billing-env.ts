import { z } from "zod";

export function billingEnvValue(secretKey: string | undefined) {
	return secretKey?.trim() ? z.string().min(1) : z.string().default("");
}
