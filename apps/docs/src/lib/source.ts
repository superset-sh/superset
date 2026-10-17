import { docs } from "fumadocs-mdx:collections/server";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { type InferPageType, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
	baseUrl: "/",
	source: docs.toFumadocsSource(),
	plugins: [lucideIconsPlugin()],
});

export function getPageImage(page: InferPageType<typeof source>) {
	const segments = [...page.slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}

export async function getLLMText(page: InferPageType<typeof source>) {
	const processed = await page.data.getText("processed");

	return [
		`# ${page.data.title}`,
		`Source: ${CANONICAL_URLS.DOCS}${page.url}`,
		page.data.description,
		processed,
	]
		.filter(Boolean)
		.join("\n\n");
}
