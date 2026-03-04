import { COMPANY } from "@superset/shared/constants";
import { getChangelogEntries } from "@/lib/changelog";

export async function GET() {
	const entries = getChangelogEntries();
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
    <title>Superset Changelog</title>
    <link>${baseUrl}/changelog</link>
    <description>The latest updates, improvements, and new features in Superset.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/changelog.xml" rel="self" type="application/rss+xml"/>
    ${entries
			.map(
				(entry) => `
    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${baseUrl}/changelog/${entry.slug}</link>
      <description>${escapeXml(entry.description || "")}</description>
      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/changelog/${entry.slug}</guid>
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
