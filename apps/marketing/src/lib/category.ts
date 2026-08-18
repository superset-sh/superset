import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { normalizeContentDate } from "./content-utils";

export interface CategoryPage {
	slug: string;
	url: string;
	title: string;
	description: string;
	date: string;
	lastUpdated?: string;
	keywords: string[];
	content: string;
}

const CATEGORY_DIR = path.join(process.cwd(), "content/category");

function parseFrontmatter(filePath: string): CategoryPage | null {
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		const { data, content } = matter(fileContent);

		const slug = path.basename(filePath, ".mdx");
		const dateValue = normalizeContentDate(data.date) as string;
		const lastUpdated = normalizeContentDate(data.lastUpdated, {
			fallbackToNow: false,
		});

		return {
			slug,
			url: `/${slug}`,
			title: data.title ?? "Untitled",
			description: data.description ?? "",
			date: dateValue,
			lastUpdated,
			keywords: data.keywords ?? [],
			content,
		};
	} catch {
		return null;
	}
}

export function getCategoryPages(): CategoryPage[] {
	if (!fs.existsSync(CATEGORY_DIR)) {
		return [];
	}

	const files = fs.readdirSync(CATEGORY_DIR).filter((f) => f.endsWith(".mdx"));

	return files
		.map((file) => parseFrontmatter(path.join(CATEGORY_DIR, file)))
		.filter((page): page is CategoryPage => page !== null);
}

export function getCategoryPage(slug: string): CategoryPage | undefined {
	const filePath = path.join(CATEGORY_DIR, `${slug}.mdx`);

	if (!fs.existsSync(filePath)) {
		return undefined;
	}

	return parseFrontmatter(filePath) ?? undefined;
}
