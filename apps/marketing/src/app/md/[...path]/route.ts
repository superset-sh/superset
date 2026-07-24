import { COMPANY } from "@superset/shared/constants";
import { getBlogPost } from "@/lib/blog";
import { getComparisonPage } from "@/lib/compare";
import { MARKDOWN_HEADERS, stripMdxSyntax } from "@/lib/llms";

interface MarkdownPage {
	title: string;
	url: string;
	date?: string;
	author?: string;
	description?: string;
	content: string;
}

function loadPage(section: string, slug: string): MarkdownPage | undefined {
	const baseUrl = COMPANY.MARKETING_URL;
	if (section === "blog") {
		const post = getBlogPost(slug);
		if (!post) return undefined;
		return {
			title: post.title,
			url: `${baseUrl}/blog/${post.slug}`,
			date: post.date,
			author: post.author.name,
			description: post.description,
			content: post.content,
		};
	}
	if (section === "compare") {
		const page = getComparisonPage(slug);
		if (!page) return undefined;
		return {
			title: page.title,
			url: `${baseUrl}/compare/${page.slug}`,
			date: page.lastUpdated ?? page.date,
			description: page.description,
			content: page.content,
		};
	}
	return undefined;
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const { path } = await params;
	const [section, slug] = path;
	if (path.length !== 2 || !section || !slug) {
		return new Response("Not found", { status: 404 });
	}
	const page = loadPage(section, slug);
	if (!page) {
		return new Response("Not found", { status: 404 });
	}

	const lines = [
		`# ${page.title}`,
		"",
		...(page.description ? [page.description, ""] : []),
		`URL: ${page.url}`,
		...(page.date ? [`Date: ${page.date}`] : []),
		...(page.author ? [`Author: ${page.author}`] : []),
		"",
		stripMdxSyntax(page.content),
		"",
	];

	return new Response(lines.join("\n"), { headers: MARKDOWN_HEADERS });
}
