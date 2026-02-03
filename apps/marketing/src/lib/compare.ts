import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { slugify, type TocItem } from "./blog-utils";
import type { ComparisonPage } from "./compare-utils";

export { type ComparisonPage, formatCompareDate } from "./compare-utils";

const COMPARE_DIR = path.join(process.cwd(), "content/compare");

function parseFrontmatter(filePath: string): ComparisonPage | null {
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

		let lastUpdated: string | undefined;
		if (data.lastUpdated instanceof Date) {
			lastUpdated = data.lastUpdated.toISOString().split("T")[0] as string;
		} else if (data.lastUpdated) {
			lastUpdated = String(data.lastUpdated);
		}

		return {
			slug,
			url: `/compare/${slug}`,
			title: data.title ?? "Untitled",
			description: data.description ?? "",
			date: dateValue,
			lastUpdated,
			type: data.type ?? "1v1",
			competitors: data.competitors ?? [],
			keywords: data.keywords ?? [],
			image: data.image,
			content,
		};
	} catch {
		return null;
	}
}

export function getComparisonPages(): ComparisonPage[] {
	if (!fs.existsSync(COMPARE_DIR)) {
		return [];
	}

	const files = fs.readdirSync(COMPARE_DIR).filter((f) => f.endsWith(".mdx"));

	const pages = files
		.map((file) => parseFrontmatter(path.join(COMPARE_DIR, file)))
		.filter((page): page is ComparisonPage => page !== null);

	return pages.sort((a, b) => {
		const dateA = new Date(a.date);
		const dateB = new Date(b.date);
		return dateB.getTime() - dateA.getTime();
	});
}

export function getComparisonPage(slug: string): ComparisonPage | undefined {
	const filePath = path.join(COMPARE_DIR, `${slug}.mdx`);

	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return parseFrontmatter(filePath) ?? undefined;
}

export function getAllComparisonSlugs(): string[] {
	if (!fs.existsSync(COMPARE_DIR)) {
		return [];
	}

	return fs
		.readdirSync(COMPARE_DIR)
		.filter((f) => f.endsWith(".mdx"))
		.map((f) => f.replace(".mdx", ""));
}

export function extractCompareToc(content: string): TocItem[] {
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
