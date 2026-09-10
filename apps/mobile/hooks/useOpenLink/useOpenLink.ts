import { useRouter } from "expo-router";
import { useCallback } from "react";
import { env } from "@/lib/env";
import { openUrl } from "@/lib/open-url";
import { pageSlugFromUrl } from "@/lib/page-links";

export function useOpenLink(): (url: string) => void {
	const router = useRouter();

	return useCallback(
		(url: string) => {
			const slug = pageSlugFromUrl(url, env.EXPO_PUBLIC_WEB_URL);
			if (slug === null) {
				openUrl(url);
				return;
			}
			router.push({
				pathname: "/(authenticated)/pages/[slug]/preview",
				params: { slug },
			});
		},
		[router],
	);
}
