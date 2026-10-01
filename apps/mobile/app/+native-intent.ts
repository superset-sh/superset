import { env } from "@/lib/env";
import { pageSlugFromUrl } from "@/lib/page-links";

export function redirectSystemPath({
	path,
}: {
	path: string;
	initial: boolean;
}): string {
	const slug = pageSlugFromUrl(path, env.EXPO_PUBLIC_WEB_URL);
	return slug === null ? path : `/pages/${slug}`;
}
