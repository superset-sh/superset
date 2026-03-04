import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { type BlogPost, slugify, type TocItem } from "./blog-utils";
import { normalizeContentDate } from "./content-utils";
import { getPersonById } from "./people";

export { BLOG_CATEGORIES, type BlogCategory } from "./blog-constants";
export {
	type BlogPost,
	formatBlogDate,
	slugify,
	type TocItem,
} from "./blog-utils";
export type { Person } from "./people";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

function parseFrontmatter(filePath: string): BlogPost | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(fileContent);

		const slug = path.basename(filePath, ".mdx");
		const dateValue = normalizeContentDate(data.date) as string;

		const authorId: string = data.author ?? "unknown";
		const author = getPersonById(authorId) ?? {
			id: authorId,
			name: authorId,
			role: "",
			content: "",
		};

		return {
			slug,
			url: `/blog/${slug}`,
			title: data.title ?? "Untitled",
			description: data.description,
			author,
			date: dateValue,
			category: data.category ?? "News",
			image: data.image,
			relatedSlugs: data.relatedSlugs,
			faq: data.faq,
			keywords: data.keywords,
			content,
		};
	} catch {
		return null;
	}
}

export function getBlogPosts(): BlogPost[] {
	if (!fs.existsSync(BLOG_DIR)) {
		return [];
	}

	const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));

	const posts = files
		.map((file) => parseFrontmatter(path.join(BLOG_DIR, file)))
		.filter((post): post is BlogPost => post !== null);

	return posts.sort((a, b) => {
		const dateA = new Date(a.date);
		const dateB = new Date(b.date);
		return dateB.getTime() - dateA.getTime();
	});
}

export function getBlogPost(slug: string): BlogPost | undefined {
	const filePath = path.join(BLOG_DIR, `${slug}.mdx`);

	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return parseFrontmatter(filePath) ?? undefined;
}

export function getAllSlugs(): string[] {
	if (!fs.existsSync(BLOG_DIR)) {
		return [];
	}

	return fs
		.readdirSync(BLOG_DIR)
		.filter((f) => f.endsWith(".mdx"))
		.map((f) => f.replace(".mdx", ""));
}

const MAX_RELATED_POSTS = 3;

export function getRelatedPosts({
	slug,
	relatedSlugs,
}: {
	slug: string;
	relatedSlugs?: string[];
}): BlogPost[] {
	if (relatedSlugs && relatedSlugs.length > 0) {
		return relatedSlugs
			.map((s) => getBlogPost(s))
			.filter((post): post is BlogPost => post !== undefined);
	}

	return getBlogPosts()
		.filter((post) => post.slug !== slug)
		.slice(0, MAX_RELATED_POSTS);
}

export function extractToc(content: string): TocItem[] {
	const headingRegex = /^(#{2,3})\s+(.+)$/gm;
	const toc: TocItem[] = [];

	for (const match of content.matchAll(headingRegex)) {
		const hashes = match[1];
		const heading = match[2];
		if (!hashes || !heading) continue;

		const level = hashes.length;
		const text = heading.trim();
		const id = slugify(text);

		toc.push({ id, text, level });
	}

	return toc;
}
