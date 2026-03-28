import { resolveExternalApiUrl } from "@superset/shared/external-api-url";
import { env } from "../env";

export function getExternalApiUrl(path?: string): string {
	return resolveExternalApiUrl({
		apiUrl: env.NEXT_PUBLIC_API_URL,
		externalApiUrl: env.EXTERNAL_API_URL,
		path,
	});
}
