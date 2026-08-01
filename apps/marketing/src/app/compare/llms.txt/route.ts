import { COMPANY } from "@superset/shared/constants";
import { getComparisonPages } from "@/lib/compare";

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const pages = getComparisonPages();

	const lines = [
		`# ${COMPANY.NAME} Comparisons`,
		"",
		`> Comparisons of ${COMPANY.NAME} with other AI coding tools, and guides to the parallel-agent workflow.`,
		"",
		"Append `.md` to any page URL for a markdown version.",
		"",
		"## Pages",
		"",
		...pages.map(
			(page) =>
				`- [${page.title}](${baseUrl}/compare/${page.slug})${page.description ? `: ${page.description}` : ""}`,
		),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
