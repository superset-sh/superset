import { COMPANY } from "@superset/shared/constants";
import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = COMPANY.DOCS_URL;

	const pages = source.getPages();

	return pages.map((page) => ({
		url: `${baseUrl}${page.url}`,
		lastModified: new Date(),
		changeFrequency: "weekly" as const,
		priority: page.url === "/installation" ? 1.0 : 0.8,
	}));
}
