import { expect, mock, test } from "bun:test";
import { getBlogPosts } from "@/lib/blog";

mock.module("server-only", () => ({}));
mock.module("@/app/[lang]/utils/leaderboardClient", () => ({
	leaderboardClient: {},
}));
const { GET } = await import("./route");

test("blog Markdown preserves publication dates alongside recorded updates", async () => {
	const posts = getBlogPosts();
	const updated = posts.find(
		(post) => post.lastUpdated && post.lastUpdated !== post.date,
	);
	const original = posts.find((post) => !post.lastUpdated);
	if (!updated || !original)
		throw new Error("Expected updated and original blog articles");

	for (const post of [updated, original]) {
		const response = await GET(
			new Request(`https://superset.sh/md/blog/${post.slug}`),
			{
				params: Promise.resolve({ lang: "en", path: ["blog", post.slug] }),
			},
		);
		const body = await response.text();
		expect(response.status).toBe(200);
		expect(body).toContain(`\nDate: ${post.date}\n`);
		expect(body).toContain(`last-updated: ${post.lastUpdated ?? post.date}\n`);
		if (post.lastUpdated) {
			expect(body).toContain(`\nLast updated: ${post.lastUpdated}\n`);
		} else {
			expect(body).not.toContain("\nLast updated:");
		}
	}
});
