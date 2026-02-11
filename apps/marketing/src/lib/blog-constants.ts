export const BLOG_CATEGORIES = [
	"All Posts",
	"Product",
	"Research",
	"Company",
	"News",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
