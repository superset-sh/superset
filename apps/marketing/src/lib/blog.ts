import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { BlogCategory } from "./blog-constants";

export { BLOG_CATEGORIES, type BlogCategory } from "./blog-constants";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPost {
	slug: string;
	url: string;
	title: string;
	description?: string;
	author: string;
	date: string;
	category: BlogCategory;
	image?: string;
	content: string;
}

function parseFrontmatter(filePath: string): BlogPost | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(fileContent);

		const slug = path.basename(filePath, ".mdx");

		let dateValue: string;
		if (data.date instanceof Date) {
			dateValue = data.date.toISOString().split("T")[0] as string;
		} else if (data.date) {
			dateValue = String(data.date);
		} else {
			dateValue = new Date().toISOString().split("T")[0] as string;
		}

		return {
			slug,
			url: `/blog/${slug}`,
			title: data.title ?? "Untitled",
			description: data.description,
			author: data.author ?? "Unknown",
			date: dateValue,
			category: data.category ?? "News",
			image: data.image,
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

export interface TocItem {
	id: string;
	text: string;
	level: number;
}

export function extractToc(content: string): TocItem[] {
	const headingRegex = /^(#{2,3})\s+(.+)$/gm;
	const toc: TocItem[] = [];
	let match: RegExpExecArray | null;

	while ((match = headingRegex.exec(content)) !== null) {
		const hashes = match[1];
		const heading = match[2];
		if (!hashes || !heading) continue;

		const level = hashes.length;
		const text = heading.trim();
		const id = text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");

		toc.push({ id, text, level });
	}

	return toc;
}
