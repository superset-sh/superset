import { buildLlmsTxt, MARKDOWN_HEADERS } from "@/lib/llms";

export async function GET() {
	return new Response(buildLlmsTxt(), { headers: MARKDOWN_HEADERS });
}
