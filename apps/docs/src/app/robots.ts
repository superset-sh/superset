import { COMPANY } from "@superset/shared/constants";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				// Rendering assets must be crawlable. Raw markdown routes carry
				// noindex headers, which crawlers need to fetch to observe.
				disallow: ["/api/"],
			},
		],
		sitemap: `${COMPANY.DOCS_URL}/sitemap.xml`,
	};
}
