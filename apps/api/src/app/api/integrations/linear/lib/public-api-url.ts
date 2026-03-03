import { env } from "@/env";

export function getLinearPublicApiUrl(): string {
	return env.LINEAR_PUBLIC_API_URL ?? env.NEXT_PUBLIC_API_URL;
}
