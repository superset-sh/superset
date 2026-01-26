import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = "https://docs.superset.sh";

	const pages = source.getPages();

	return pages.map((page) => ({
		url: `${baseUrl}${page.url}`,
		lastModified: new Date(),
		changeFrequency: "weekly" as const,
		priority: page.url === "/quick-start" ? 1.0 : 0.8,
	}));
}
