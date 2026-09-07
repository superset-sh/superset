import { COMPANY } from "@superset/shared/constants";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				// No /_next/ block: Google needs build assets (CSS, JS, fonts) to
				// render pages, and blocking them triggers Search Console reports.
				allow: "/",
				disallow: ["/api/", "/llms.mdx/", "/llms-full.txt"],
			},
		],
		sitemap: `${COMPANY.DOCS_URL}/sitemap.xml`,
	};
}
