import { COMPANY } from "@superset/shared/constants";
import { getBlogPosts } from "@/lib/blog";

export async function GET() {
	const posts = getBlogPosts();
	const baseUrl = COMPANY.MARKETING_URL;

	const escapeXml = (str: string) =>
		str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");

	const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Superset Blog</title>
    <link>${baseUrl}/blog</link>
    <description>News, updates, and insights from the Superset team about parallel coding agents and developer productivity.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    ${posts
			.map(
				(post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${baseUrl}/blog/${post.slug}</link>
      <description>${escapeXml(post.description || "")}</description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/blog/${post.slug}</guid>
      <author>${escapeXml(post.author.name)}</author>
    </item>`,
			)
			.join("")}
  </channel>
</rss>`;

	return new Response(rss, {
		headers: {
			"Content-Type": "application/xml",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
