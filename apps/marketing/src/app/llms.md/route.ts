import { COMPANY } from "@superset/shared/constants";
import {
	buildFrontmatter,
	buildLlmsTxt,
	MARKDOWN_HEADERS,
	PRODUCT_SUMMARY,
} from "@/lib/llms";

export async function GET() {
	const frontmatter = buildFrontmatter({
		title: `${COMPANY.NAME} llms.txt`,
		description: PRODUCT_SUMMARY,
		canonical: `${COMPANY.MARKETING_URL}/llms.md`,
	});
	return new Response([...frontmatter, buildLlmsTxt()].join("\n"), {
		headers: MARKDOWN_HEADERS,
	});
}
