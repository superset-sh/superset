import { describe, expect, test } from "bun:test";
import {
	getAllSlugs,
	getBlogPost,
	getBlogPosts,
	getListedBlogPosts,
	getRelatedPosts,
} from "./blog";

const unlistedSlugs = [
	"claude-code-codex-iphone",
	"scheduled-agent-maintenance",
	"parallel-coding-agents-guide",
	"superset-mobile",
];

describe("unlisted blog posts", () => {
	test("remain published for direct routes, sitemaps, and LLM discovery", () => {
		for (const slug of unlistedSlugs) {
			expect(getBlogPost(slug)?.unlisted).toBe(true);
			expect(getBlogPosts().some((post) => post.slug === slug)).toBe(true);
			expect(getAllSlugs()).toContain(slug);
		}
	});

	test("stay out of listings, feeds, and related-post recommendations", () => {
		const posts = getListedBlogPosts();
		expect(posts.length).toBeGreaterThan(0);
		expect(posts.some((post) => unlistedSlugs.includes(post.slug))).toBe(false);
		expect(
			getRelatedPosts({
				slug: "working-with-worktrees-in-superset",
				relatedSlugs: unlistedSlugs,
			}),
		).toEqual([]);
		expect(
			getRelatedPosts({ slug: "working-with-worktrees-in-superset" }).some(
				(post) => unlistedSlugs.includes(post.slug),
			),
		).toBe(false);
	});
});
